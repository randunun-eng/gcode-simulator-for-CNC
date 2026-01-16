/**
 * G-code AI Assistant - Cloudflare Worker with CAG (Cache-Augmented Generation)
 * 
 * CAG Model: Pre-caches common G-code patterns and responses for faster, 
 * more consistent results without repeatedly calling the LLM.
 */

// ===== CAG Knowledge Base (Cached G-code Patterns) =====
const GCODE_CACHE = {
    // Common shapes
    circle: (x, y, r) => `G21
G90
G0 Z5           ; Pen up
G0 X${(parseFloat(x) + parseFloat(r)).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1          ; Pen down
${Array.from({ length: 36 }, (_, i) => {
        const angle = ((i + 1) / 36) * 2 * Math.PI;
        return `G1 X${(parseFloat(x) + parseFloat(r) * Math.cos(angle)).toFixed(2)} Y${(parseFloat(y) + parseFloat(r) * Math.sin(angle)).toFixed(2)} F400`;
    }).join('\n')}
G0 Z5           ; Pen up`,

    rectangle: (x, y, w, h) => `G21
G90
G0 Z5           ; Pen up
G0 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1          ; Pen down
G1 X${(parseFloat(x) + parseFloat(w)).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G1 X${(parseFloat(x) + parseFloat(w)).toFixed(2)} Y${(parseFloat(y) + parseFloat(h)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${(parseFloat(y) + parseFloat(h)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G0 Z5           ; Pen up`,

    line: (x1, y1, x2, y2) => `G21
G90
G0 Z5           ; Pen up
G0 X${parseFloat(x1).toFixed(2)} Y${parseFloat(y1).toFixed(2)}
G0 Z-1          ; Pen down
G1 X${parseFloat(x2).toFixed(2)} Y${parseFloat(y2).toFixed(2)} F400
G0 Z5           ; Pen up`,

    square: (x, y, size) => `G21
G90
G0 Z5           ; Pen up
G0 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1          ; Pen down
G1 X${(parseFloat(x) + parseFloat(size)).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G1 X${(parseFloat(x) + parseFloat(size)).toFixed(2)} Y${(parseFloat(y) + parseFloat(size)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${(parseFloat(y) + parseFloat(size)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G0 Z5           ; Pen up`,

    triangle: (x, y, size) => `G21
G90
G0 Z5           ; Pen up
G0 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1          ; Pen down
G1 X${(parseFloat(x) + parseFloat(size)).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G1 X${(parseFloat(x) + parseFloat(size) / 2).toFixed(2)} Y${(parseFloat(y) + parseFloat(size) * 0.866).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G0 Z5           ; Pen up`
};

// G-code command explanations (cached knowledge)
const GCODE_EXPLANATIONS = {
    'g0': '**G0** = Rapid positioning move (non-cutting, fastest speed). Tool moves quickly without cutting. Example: `G0 X10 Y20`',
    'g1': '**G1** = Linear interpolation (cutting move). Tool moves in a straight line while cutting/drawing. Example: `G1 X30 Y40 F400`',
    'g2': '**G2** = Clockwise arc. Creates circular cuts clockwise.',
    'g3': '**G3** = Counter-clockwise arc. Creates circular cuts counter-clockwise.',
    'g21': '**G21** = Set units to millimeters.',
    'g20': '**G20** = Set units to inches.',
    'g90': '**G90** = Absolute positioning mode. Coordinates are relative to origin.',
    'g91': '**G91** = Incremental positioning mode. Coordinates are relative to current position.',
    'm30': '**M30** = Program end. Stops the program and resets.',
    'f': '**F** = Feed rate. Speed of cutting movement in mm/min or inches/min.',
    'z': '**Z** = Z-axis position. Positive = up (pen up), Negative = down (pen cutting).'
};

// Pattern matching for CAG
function matchCachedPattern(message) {
    const lower = message.toLowerCase();

    // Circle pattern
    const circleMatch = lower.match(/circle.*?(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?).*?radius\s*(\d+(?:\.\d+)?)/i) ||
        lower.match(/circle.*?radius\s*(\d+(?:\.\d+)?)/i);
    if (lower.includes('circle')) {
        if (circleMatch && circleMatch[3]) {
            const [, x, y, r] = circleMatch;
            return {
                type: 'gcode',
                response: `Here's a circle at (${x}, ${y}) with radius ${r}mm:\n\n\`\`\`gcode\n${GCODE_CACHE.circle(x, y, r)}\n\`\`\``
            };
        } else if (circleMatch && circleMatch[1]) {
            const r = circleMatch[1];
            return {
                type: 'gcode',
                response: `Here's a circle at origin with radius ${r}mm:\n\n\`\`\`gcode\n${GCODE_CACHE.circle(0, 0, r)}\n\`\`\``
            };
        }
        return {
            type: 'gcode',
            response: `Here's a default circle at (50, 50) with radius 20mm:\n\n\`\`\`gcode\n${GCODE_CACHE.circle(50, 50, 20)}\n\`\`\``
        };
    }

    // Rectangle pattern
    const rectMatch = lower.match(/rectangle.*?(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (lower.includes('rectangle') || lower.includes('rect')) {
        if (rectMatch) {
            const [, w, h] = rectMatch;
            return {
                type: 'gcode',
                response: `Here's a ${w}×${h}mm rectangle:\n\n\`\`\`gcode\n${GCODE_CACHE.rectangle(0, 0, w, h)}\n\`\`\``
            };
        }
        return {
            type: 'gcode',
            response: `Here's a 50×30mm rectangle:\n\n\`\`\`gcode\n${GCODE_CACHE.rectangle(0, 0, 50, 30)}\n\`\`\``
        };
    }

    // Square pattern
    const squareMatch = lower.match(/square.*?(\d+(?:\.\d+)?)\s*mm/i);
    if (lower.includes('square')) {
        const size = squareMatch ? squareMatch[1] : '40';
        return {
            type: 'gcode',
            response: `Here's a ${size}mm square:\n\n\`\`\`gcode\n${GCODE_CACHE.square(0, 0, size)}\n\`\`\``
        };
    }

    // Triangle pattern
    if (lower.includes('triangle')) {
        return {
            type: 'gcode',
            response: `Here's a 40mm triangle:\n\n\`\`\`gcode\n${GCODE_CACHE.triangle(0, 0, 40)}\n\`\`\``
        };
    }

    // Line pattern
    const lineMatch = lower.match(/line.*?from\s*(\d+)\s*[,\s]\s*(\d+).*?to\s*(\d+)\s*[,\s]\s*(\d+)/i);
    if (lower.includes('line') && lineMatch) {
        const [, x1, y1, x2, y2] = lineMatch;
        return {
            type: 'gcode',
            response: `Here's a line from (${x1}, ${y1}) to (${x2}, ${y2}):\n\n\`\`\`gcode\n${GCODE_CACHE.line(x1, y1, x2, y2)}\n\`\`\``
        };
    }

    // G-code explanations
    for (const [code, explanation] of Object.entries(GCODE_EXPLANATIONS)) {
        if (lower.includes(code) && (lower.includes('what') || lower.includes('explain') || lower.includes('meaning'))) {
            return { type: 'explanation', response: explanation };
        }
    }

    // Feed rate change
    const feedMatch = lower.match(/(?:set|change).*?feed\s*(?:rate)?\s*(?:to)?\s*(\d+)/i);
    if (feedMatch) {
        return {
            type: 'info',
            response: `To change feed rate to ${feedMatch[1]}mm/min, replace all \`F\` values in your G-code with \`F${feedMatch[1]}\`.\n\nExample:\n\`G1 X50 Y50 F${feedMatch[1]}\``
        };
    }

    return null;
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        try {
            const { message, currentGcode } = await request.json();

            // ===== CAG: Try cached response first =====
            const cachedResponse = matchCachedPattern(message);
            if (cachedResponse) {
                return new Response(JSON.stringify({
                    success: true,
                    response: cachedResponse.response,
                    cached: true
                }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // ===== Fall back to LLM for complex queries =====
            const systemPrompt = `You are a G-code expert for CNC machines and pen plotters.
Current G-code context: ${currentGcode ? currentGcode.substring(0, 500) + '...' : 'None'}

Rules:
1. Generate G-code with G0 Z5 (pen up) and G0 Z-1 (pen down)
2. Use F400 for feed rate, G21 for mm, G90 for absolute
3. Wrap G-code in \`\`\`gcode blocks
4. Keep responses concise`;

            const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 512,
            });

            return new Response(JSON.stringify({
                success: true,
                response: response.response,
                cached: false
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },
};

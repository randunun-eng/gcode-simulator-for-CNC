/**
 * G-code AI Assistant - Cloudflare Worker with CAG (Cache-Augmented Generation)
 * 
 * Conversational Mode: Asks clarifying questions instead of assuming/hallucinating
 */

// ===== CAG Knowledge Base (Cached G-code Patterns) =====
const GCODE_CACHE = {
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

    line: (x1, y1, x2, y2) => `G21
G90
G0 Z5           ; Pen up
G0 X${parseFloat(x1).toFixed(2)} Y${parseFloat(y1).toFixed(2)}
G0 Z-1          ; Pen down
G1 X${parseFloat(x2).toFixed(2)} Y${parseFloat(y2).toFixed(2)} F400
G0 Z5           ; Pen up`
};

// G-code command explanations
const GCODE_EXPLANATIONS = {
    'g0': '**G0** = Rapid positioning (non-cutting). Tool moves quickly without cutting.',
    'g1': '**G1** = Linear move (cutting). Tool moves in a straight line while cutting/drawing.',
    'g21': '**G21** = Set units to millimeters.',
    'g90': '**G90** = Absolute positioning. Coordinates relative to origin.',
    'f': '**F** = Feed rate in mm/min.',
    'z': '**Z** = Z-axis. Positive = up (pen up), Negative = down (cutting).'
};

// Conversational pattern matching - asks clarifying questions
function matchCachedPattern(message) {
    const lower = message.toLowerCase();

    // ===== CIRCLE =====
    if (lower.includes('circle')) {
        // Check if all parameters provided
        const posMatch = lower.match(/(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/);
        const radiusMatch = lower.match(/radius\s*(\d+(?:\.\d+)?)/i) || lower.match(/r\s*=?\s*(\d+(?:\.\d+)?)/i);

        if (posMatch && radiusMatch) {
            // All info provided - generate G-code
            const [, x, y] = posMatch;
            const r = radiusMatch[1];
            return {
                type: 'gcode',
                response: `Here's a circle at (${x}, ${y}) with radius ${r}mm:\n\n\`\`\`gcode\n${GCODE_CACHE.circle(x, y, r)}\n\`\`\``
            };
        } else if (radiusMatch && !posMatch) {
            // Has radius but no position - ask for position
            return {
                type: 'clarify',
                response: `I can create a circle with radius ${radiusMatch[1]}mm.\n\n**Where should I place it?** Please provide the center position (X, Y coordinates in mm).`
            };
        } else if (posMatch && !radiusMatch) {
            // Has position but no radius - ask for radius
            return {
                type: 'clarify',
                response: `I can create a circle at position (${posMatch[1]}, ${posMatch[2]}).\n\n**What radius?** Please specify the radius in mm.`
            };
        } else {
            // No parameters - ask for all
            return {
                type: 'clarify',
                response: `I can create a circle for you!\n\n**Please provide:**\n1. Center position (X, Y) in mm\n2. Radius in mm\n\nExample: "circle at 50,50 radius 20"`
            };
        }
    }

    // ===== RECTANGLE =====
    if (lower.includes('rectangle') || lower.includes('rect')) {
        const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
        const posMatch = lower.match(/at\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);

        if (sizeMatch) {
            const [, w, h] = sizeMatch;
            const x = posMatch ? posMatch[1] : '0';
            const y = posMatch ? posMatch[2] : '0';
            return {
                type: 'gcode',
                response: `Here's a ${w}×${h}mm rectangle at (${x}, ${y}):\n\n\`\`\`gcode\n${GCODE_CACHE.rectangle(x, y, w, h)}\n\`\`\``
            };
        } else {
            return {
                type: 'clarify',
                response: `I can create a rectangle for you!\n\n**Please provide:**\n1. Width and height (e.g., "50x30")\n2. Optionally, position (e.g., "at 10,10")\n\nExample: "rectangle 50x30 at 10,10"`
            };
        }
    }

    // ===== SQUARE =====
    if (lower.includes('square')) {
        const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*mm/i) || lower.match(/size\s*(\d+(?:\.\d+)?)/i);

        if (sizeMatch) {
            return {
                type: 'gcode',
                response: `Here's a ${sizeMatch[1]}mm square:\n\n\`\`\`gcode\n${GCODE_CACHE.square(0, 0, sizeMatch[1])}\n\`\`\``
            };
        } else {
            return {
                type: 'clarify',
                response: `I can create a square for you!\n\n**What size?** Please specify the side length in mm.\n\nExample: "square 40mm"`
            };
        }
    }

    // ===== LINE =====
    if (lower.includes('line')) {
        const fromMatch = lower.match(/from\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);
        const toMatch = lower.match(/to\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);

        if (fromMatch && toMatch) {
            const [, x1, y1] = fromMatch;
            const [, x2, y2] = toMatch;
            return {
                type: 'gcode',
                response: `Here's a line from (${x1}, ${y1}) to (${x2}, ${y2}):\n\n\`\`\`gcode\n${GCODE_CACHE.line(x1, y1, x2, y2)}\n\`\`\``
            };
        } else {
            return {
                type: 'clarify',
                response: `I can create a line for you!\n\n**Please provide:**\n1. Start point (X, Y)\n2. End point (X, Y)\n\nExample: "line from 0,0 to 50,50"`
            };
        }
    }

    // ===== G-CODE EXPLANATIONS =====
    for (const [code, explanation] of Object.entries(GCODE_EXPLANATIONS)) {
        if (lower.includes(code) && (lower.includes('what') || lower.includes('explain') || lower.includes('mean'))) {
            return { type: 'explanation', response: explanation };
        }
    }

    // ===== FEED RATE =====
    if (lower.includes('feed') && lower.includes('rate')) {
        const feedMatch = lower.match(/(\d+)/);
        if (feedMatch) {
            return {
                type: 'info',
                response: `To change feed rate to ${feedMatch[1]}mm/min, replace all \`F\` values with \`F${feedMatch[1]}\`.\n\nExample: \`G1 X50 Y50 F${feedMatch[1]}\``
            };
        } else {
            return {
                type: 'clarify',
                response: `**What feed rate would you like?** Please specify in mm/min.\n\nTypical values:\n- 200-400: Fine detail/pen plotting\n- 500-1000: General cutting\n- 1000+: Fast roughing`
            };
        }
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

            // ===== CAG: Try cached/conversational response first =====
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
            const systemPrompt = `You are a helpful G-code assistant for CNC machines and pen plotters.

IMPORTANT RULES:
1. If the user's request is unclear or missing information, ASK CLARIFYING QUESTIONS. Do NOT guess or assume.
2. Common things to clarify: position, size, dimensions, feed rate
3. When you have all needed info, generate G-code with:
   - G21 for millimeters
   - G90 for absolute positioning  
   - G0 Z5 for pen up, G0 Z-1 for pen down
   - F400 for feed rate (unless specified)
4. Wrap G-code in \`\`\`gcode blocks
5. Keep responses concise

Current G-code context: ${currentGcode ? currentGcode.substring(0, 300) : 'None loaded'}`;

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

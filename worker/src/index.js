/**
 * G-code AI Assistant - SIMPLIFIED
 * 
 * Design: Use sensible defaults, generate G-code immediately, minimal questions
 */

// ===== G-code Generators =====
const GCODE = {
    circle: (x = 50, y = 50, r = 20) => `G21
G90
G0 Z5
G0 X${(parseFloat(x) + parseFloat(r)).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1
${Array.from({ length: 36 }, (_, i) => {
        const angle = ((i + 1) / 36) * 2 * Math.PI;
        return `G1 X${(parseFloat(x) + parseFloat(r) * Math.cos(angle)).toFixed(2)} Y${(parseFloat(y) + parseFloat(r) * Math.sin(angle)).toFixed(2)} F400`;
    }).join('\n')}
G0 Z5
G0 X0 Y0`,

    rectangle: (x = 0, y = 0, w = 50, h = 30) => `G21
G90
G0 Z5
G0 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1
G1 X${(parseFloat(x) + parseFloat(w)).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G1 X${(parseFloat(x) + parseFloat(w)).toFixed(2)} Y${(parseFloat(y) + parseFloat(h)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${(parseFloat(y) + parseFloat(h)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G0 Z5
G0 X0 Y0`,

    square: (x = 0, y = 0, size = 40) => `G21
G90
G0 Z5
G0 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)}
G0 Z-1
G1 X${(parseFloat(x) + parseFloat(size)).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G1 X${(parseFloat(x) + parseFloat(size)).toFixed(2)} Y${(parseFloat(y) + parseFloat(size)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${(parseFloat(y) + parseFloat(size)).toFixed(2)} F400
G1 X${parseFloat(x).toFixed(2)} Y${parseFloat(y).toFixed(2)} F400
G0 Z5
G0 X0 Y0`,

    line: (x1 = 0, y1 = 0, x2 = 50, y2 = 50) => `G21
G90
G0 Z5
G0 X${parseFloat(x1).toFixed(2)} Y${parseFloat(y1).toFixed(2)}
G0 Z-1
G1 X${parseFloat(x2).toFixed(2)} Y${parseFloat(y2).toFixed(2)} F400
G0 Z5
G0 X0 Y0`
};

// Simple pattern matching - generates G-code with defaults
function processMessage(message) {
    const lower = message.toLowerCase();

    // ===== CIRCLE =====
    if (lower.includes('circle') || lower.includes('circul')) {
        // Extract radius - support cm and mm
        let radius = 20; // default
        const cmMatch = lower.match(/(\d+(?:\.\d+)?)\s*cm/i);
        const mmMatch = lower.match(/(\d+(?:\.\d+)?)\s*mm/i);
        const radiusMatch = lower.match(/radius\s*(\d+(?:\.\d+)?)/i) || lower.match(/r\s*=?\s*(\d+(?:\.\d+)?)/i);

        if (cmMatch) {
            radius = parseFloat(cmMatch[1]) * 10; // convert cm to mm
        } else if (mmMatch) {
            radius = parseFloat(mmMatch[1]);
        } else if (radiusMatch) {
            radius = parseFloat(radiusMatch[1]);
        }

        // Extract position if provided
        let x = 50, y = 50; // default center
        const posMatch = lower.match(/at\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);
        if (posMatch) {
            x = parseFloat(posMatch[1]);
            y = parseFloat(posMatch[2]);
        }

        return {
            response: `Circle created! Radius: ${radius}mm, Center: (${x}, ${y})\n\n\`\`\`gcode\n${GCODE.circle(x, y, radius)}\n\`\`\``
        };
    }

    // ===== RECTANGLE =====
    if (lower.includes('rectangle') || lower.includes('rect')) {
        let w = 50, h = 30;
        const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
        if (sizeMatch) {
            w = parseFloat(sizeMatch[1]);
            h = parseFloat(sizeMatch[2]);
        }

        return {
            response: `Rectangle created! Size: ${w}×${h}mm\n\n\`\`\`gcode\n${GCODE.rectangle(0, 0, w, h)}\n\`\`\``
        };
    }

    // ===== SQUARE =====
    if (lower.includes('square')) {
        let size = 40;
        const sizeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm)?/i);
        if (sizeMatch) {
            size = parseFloat(sizeMatch[1]);
            if (lower.includes('cm')) size *= 10;
        }

        return {
            response: `Square created! Size: ${size}mm\n\n\`\`\`gcode\n${GCODE.square(0, 0, size)}\n\`\`\``
        };
    }

    // ===== LINE =====
    if (lower.includes('line')) {
        let x1 = 0, y1 = 0, x2 = 50, y2 = 50;
        const fromMatch = lower.match(/from\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);
        const toMatch = lower.match(/to\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/i);

        if (fromMatch) { x1 = parseFloat(fromMatch[1]); y1 = parseFloat(fromMatch[2]); }
        if (toMatch) { x2 = parseFloat(toMatch[1]); y2 = parseFloat(toMatch[2]); }

        return {
            response: `Line created! From (${x1}, ${y1}) to (${x2}, ${y2})\n\n\`\`\`gcode\n${GCODE.line(x1, y1, x2, y2)}\n\`\`\``
        };
    }

    // ===== EXPLANATIONS =====
    if (lower.includes('g0')) return { response: '**G0** = Rapid move (fast, non-cutting). Example: `G0 X10 Y20`' };
    if (lower.includes('g1')) return { response: '**G1** = Linear cut/draw move. Example: `G1 X30 Y40 F400`' };
    if (lower.includes('what') && lower.includes('z')) return { response: '**Z axis**: Z5 = pen up, Z-1 = pen down' };

    // ===== HELP =====
    if (lower.includes('help')) {
        return {
            response: `**Quick commands:**\n- "circle 8cm" or "circle radius 20"\n- "rectangle 50x30"\n- "square 40mm"\n- "line from 0,0 to 50,50"`
        };
    }

    return null;
}

export default {
    async fetch(request, env) {
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
            const { message } = await request.json();

            // Try simple pattern matching first
            const result = processMessage(message);
            if (result) {
                return new Response(JSON.stringify({
                    success: true,
                    response: result.response,
                    cached: true
                }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // Fallback to LLM - but with strict instructions
            const systemPrompt = `You are a G-code assistant. Be BRIEF and DIRECT.

RULES:
1. If user asks for a shape, GENERATE THE G-CODE IMMEDIATELY with sensible defaults
2. Do NOT ask for confirmation
3. Use: G21 (mm), G90 (absolute), G0 Z5 (up), G0 Z-1 (down), F400 (feed)
4. Default center: (50, 50), Default size: 20mm
5. Wrap G-code in \`\`\`gcode blocks
6. Keep response under 100 words`;

            const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 400,
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

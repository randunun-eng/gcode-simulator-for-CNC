/**
 * G-code Tool Path Simulator
 * XY Axis CNC Visualization
 */

class GCodeSimulator {
    constructor() {
        this.canvas = document.getElementById('simulatorCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Simulation state
        this.commands = [];
        this.currentIndex = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.animationId = null;

        // Tool position
        this.toolX = 0;
        this.toolY = 0;
        this.feedRate = 0;

        // Bounding box
        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;

        // Display settings
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.padding = 60;
        this.speed = 50;

        // Drawing state
        this.pathHistory = [];

        // Colors
        this.colors = {
            rapid: '#ffaa00',
            linear: '#00ff88',
            tool: '#ff4466',
            grid: 'rgba(100, 100, 120, 0.15)',
            gridMajor: 'rgba(100, 100, 120, 0.3)',
            axis: 'rgba(0, 212, 255, 0.5)',
            background: '#252532'
        };

        this.init();
    }

    init() {
        this.setupCanvas();
        this.bindEvents();
        this.loadSampleGcode();
        this.draw();
    }

    setupCanvas() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();

        // Set canvas size
        this.canvas.width = rect.width - 40;
        this.canvas.height = rect.height - 40;

        // Handle resize
        window.addEventListener('resize', () => {
            const newRect = wrapper.getBoundingClientRect();
            this.canvas.width = newRect.width - 40;
            this.canvas.height = newRect.height - 40;
            this.calculateView();
            this.draw();
        });
    }

    bindEvents() {
        // Buttons
        document.getElementById('simulateBtn').addEventListener('click', () => this.startSimulation());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('loadFileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
        document.getElementById('saveFileBtn').addEventListener('click', () => this.saveFile());
        document.getElementById('loadDxfBtn').addEventListener('click', () => document.getElementById('dxfFileInput').click());

        // File inputs
        document.getElementById('fileInput').addEventListener('change', (e) => this.loadFile(e));
        document.getElementById('dxfFileInput').addEventListener('change', (e) => this.loadDxfFile(e));

        // G-code input
        document.getElementById('gcodeInput').addEventListener('input', () => this.parseGcode());

        // Speed slider
        document.getElementById('speedSlider').addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            document.getElementById('speedValue').textContent = `${this.speed}%`;
        });

        // Canvas mouse move for coordinates
        this.canvas.addEventListener('mousemove', (e) => this.showCursorPosition(e));
    }

    loadFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Set filename in input
        document.getElementById('filenameInput').value = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('gcodeInput').value = e.target.result;
            this.parseGcode();
        };
        reader.readAsText(file);
    }

    loadDxfFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Set filename (change extension to .gcode)
        const baseName = file.name.replace(/\.dxf$/i, '');
        document.getElementById('filenameInput').value = baseName + '.gcode';

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const gcode = this.dxfToGcode(e.target.result);
                document.getElementById('gcodeInput').value = gcode;
                this.parseGcode();
                this.showSaveNotification('DXF converted successfully!');
            } catch (error) {
                console.error('DXF parsing error:', error);
                alert('Error parsing DXF file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    dxfToGcode(dxfContent) {
        const lines = dxfContent.split('\n').map(l => l.trim());
        const entities = [];
        let i = 0;

        // Find ENTITIES section
        while (i < lines.length && lines[i] !== 'ENTITIES') {
            i++;
        }
        i++; // Skip 'ENTITIES'

        // Parse entities
        while (i < lines.length && lines[i] !== 'ENDSEC') {
            if (lines[i] === 'LINE') {
                const entity = this.parseDxfLine(lines, i);
                if (entity) entities.push(entity);
            } else if (lines[i] === 'LWPOLYLINE' || lines[i] === 'POLYLINE') {
                const entity = this.parseDxfPolyline(lines, i, lines[i]);
                if (entity) entities.push(entity);
            } else if (lines[i] === 'CIRCLE') {
                const entity = this.parseDxfCircle(lines, i);
                if (entity) entities.push(entity);
            } else if (lines[i] === 'ARC') {
                const entity = this.parseDxfArc(lines, i);
                if (entity) entities.push(entity);
            }
            i++;
        }

        // Generate G-code
        return this.generateGcodeFromEntities(entities);
    }

    parseDxfLine(lines, startIndex) {
        let i = startIndex + 1;
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;

        while (i < lines.length && lines[i] !== '0') {
            const code = parseInt(lines[i]);
            const value = lines[i + 1];

            if (code === 10) x1 = parseFloat(value);
            else if (code === 20) y1 = parseFloat(value);
            else if (code === 11) x2 = parseFloat(value);
            else if (code === 21) y2 = parseFloat(value);

            i += 2;
        }

        return { type: 'LINE', x1, y1, x2, y2 };
    }

    parseDxfPolyline(lines, startIndex, entityType) {
        let i = startIndex + 1;
        const points = [];
        let closed = false;
        let currentX = 0, currentY = 0;

        while (i < lines.length && (lines[i] !== '0' || (lines[i] === '0' && lines[i + 1] === 'VERTEX'))) {
            const code = parseInt(lines[i]);
            const value = lines[i + 1];

            if (code === 10) {
                if (currentX !== 0 || currentY !== 0 || points.length > 0) {
                    points.push({ x: currentX, y: currentY });
                }
                currentX = parseFloat(value);
            } else if (code === 20) {
                currentY = parseFloat(value);
            } else if (code === 70) {
                closed = (parseInt(value) & 1) === 1;
            }

            i += 2;

            // Break at next entity
            if (lines[i] === '0' && lines[i + 1] !== 'VERTEX') break;
        }

        // Add last point
        if (currentX !== 0 || currentY !== 0) {
            points.push({ x: currentX, y: currentY });
        }

        return { type: 'POLYLINE', points, closed };
    }

    parseDxfCircle(lines, startIndex) {
        let i = startIndex + 1;
        let cx = 0, cy = 0, r = 0;

        while (i < lines.length && lines[i] !== '0') {
            const code = parseInt(lines[i]);
            const value = lines[i + 1];

            if (code === 10) cx = parseFloat(value);
            else if (code === 20) cy = parseFloat(value);
            else if (code === 40) r = parseFloat(value);

            i += 2;
        }

        return { type: 'CIRCLE', cx, cy, r };
    }

    parseDxfArc(lines, startIndex) {
        let i = startIndex + 1;
        let cx = 0, cy = 0, r = 0, startAngle = 0, endAngle = 360;

        while (i < lines.length && lines[i] !== '0') {
            const code = parseInt(lines[i]);
            const value = lines[i + 1];

            if (code === 10) cx = parseFloat(value);
            else if (code === 20) cy = parseFloat(value);
            else if (code === 40) r = parseFloat(value);
            else if (code === 50) startAngle = parseFloat(value);
            else if (code === 51) endAngle = parseFloat(value);

            i += 2;
        }

        return { type: 'ARC', cx, cy, r, startAngle, endAngle };
    }

    generateGcodeFromEntities(entities) {
        const feedRate = 400;
        const safeZ = 5;      // Safe height for rapid moves (pen up)
        const cutZ = -1;      // Cutting/drawing depth (pen down)

        let gcode = [
            '%',
            '(Generated from DXF file)',
            '(Feed Rate: ' + feedRate + ' mm/min)',
            `(Safe Z: ${safeZ}mm, Cut Z: ${cutZ}mm)`,
            '',
            'G21         ; Millimeters',
            'G90         ; Absolute positioning',
            'G17         ; XY plane',
            '',
            '; Initialize - lift pen and go to origin',
            `G0 Z${safeZ}`,
            'G0 X0 Y0',
            ''
        ];

        for (const entity of entities) {
            if (entity.type === 'LINE') {
                gcode.push(`; LINE`);
                gcode.push(`G0 Z${safeZ}           ; Pen up`);
                gcode.push(`G0 X${entity.x1.toFixed(3)} Y${entity.y1.toFixed(3)}`);
                gcode.push(`G0 Z${cutZ}            ; Pen down`);
                gcode.push(`G1 X${entity.x2.toFixed(3)} Y${entity.y2.toFixed(3)} F${feedRate}`);
            } else if (entity.type === 'POLYLINE' && entity.points.length > 1) {
                gcode.push(`; POLYLINE (${entity.points.length} points)`);
                gcode.push(`G0 Z${safeZ}           ; Pen up`);
                gcode.push(`G0 X${entity.points[0].x.toFixed(3)} Y${entity.points[0].y.toFixed(3)}`);
                gcode.push(`G0 Z${cutZ}            ; Pen down`);
                for (let j = 1; j < entity.points.length; j++) {
                    gcode.push(`G1 X${entity.points[j].x.toFixed(3)} Y${entity.points[j].y.toFixed(3)} F${feedRate}`);
                }
                if (entity.closed) {
                    gcode.push(`G1 X${entity.points[0].x.toFixed(3)} Y${entity.points[0].y.toFixed(3)} F${feedRate}`);
                }
            } else if (entity.type === 'CIRCLE') {
                gcode.push(`; CIRCLE (center: ${entity.cx.toFixed(3)}, ${entity.cy.toFixed(3)}, r: ${entity.r.toFixed(3)})`);
                // Approximate circle with line segments
                const segments = 36;
                const firstX = entity.cx + entity.r;
                const firstY = entity.cy;
                gcode.push(`G0 Z${safeZ}           ; Pen up`);
                gcode.push(`G0 X${firstX.toFixed(3)} Y${firstY.toFixed(3)}`);
                gcode.push(`G0 Z${cutZ}            ; Pen down`);
                for (let j = 1; j <= segments; j++) {
                    const angle = (j / segments) * 2 * Math.PI;
                    const x = entity.cx + entity.r * Math.cos(angle);
                    const y = entity.cy + entity.r * Math.sin(angle);
                    gcode.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
                }
            } else if (entity.type === 'ARC') {
                gcode.push(`; ARC`);
                const segments = 18;
                const startRad = entity.startAngle * Math.PI / 180;
                const endRad = entity.endAngle * Math.PI / 180;
                let angleDiff = endRad - startRad;
                if (angleDiff < 0) angleDiff += 2 * Math.PI;

                const firstX = entity.cx + entity.r * Math.cos(startRad);
                const firstY = entity.cy + entity.r * Math.sin(startRad);
                gcode.push(`G0 Z${safeZ}           ; Pen up`);
                gcode.push(`G0 X${firstX.toFixed(3)} Y${firstY.toFixed(3)}`);
                gcode.push(`G0 Z${cutZ}            ; Pen down`);

                for (let j = 1; j <= segments; j++) {
                    const angle = startRad + (j / segments) * angleDiff;
                    const x = entity.cx + entity.r * Math.cos(angle);
                    const y = entity.cy + entity.r * Math.sin(angle);
                    gcode.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}`);
                }
            }
            gcode.push('');
        }

        gcode.push('; Finish - lift pen and return to origin');
        gcode.push(`G0 Z${safeZ}           ; Pen up`);
        gcode.push('G0 X0 Y0');
        gcode.push('');
        gcode.push('M30         ; Program end');
        gcode.push('%');

        return gcode.join('\n');
    }

    saveFile() {
        const gcodeContent = document.getElementById('gcodeInput').value;
        let filename = document.getElementById('filenameInput').value.trim();

        // Ensure filename has extension
        if (!filename) {
            filename = 'untitled.gcode';
        } else if (!filename.match(/\.(gcode|nc|ngc|txt)$/i)) {
            filename += '.gcode';
        }

        // Create blob and download link
        const blob = new Blob([gcodeContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up
        URL.revokeObjectURL(url);

        // Show feedback
        this.showSaveNotification(filename);
    }

    showSaveNotification(filename) {
        const indicator = document.getElementById('statusIndicator');
        const originalText = indicator.textContent;
        const originalClass = indicator.className;

        indicator.textContent = `Saved: ${filename}`;
        indicator.className = 'status-indicator';
        indicator.style.background = 'rgba(0, 255, 136, 0.15)';
        indicator.style.color = '#00ff88';
        indicator.style.borderColor = 'rgba(0, 255, 136, 0.3)';

        setTimeout(() => {
            indicator.textContent = originalText;
            indicator.className = originalClass;
            indicator.style.background = '';
            indicator.style.color = '';
            indicator.style.borderColor = '';
        }, 2000);
    }

    loadSampleGcode() {
        // Load the EKOLAHA plane G-code as sample
        const sampleGcode = `%
(EKOLAHA RC Foam Board Plane - Vectorized Outline)
(Dimensions: 145.0mm height x 205.0mm width)
(Generated from image contour extraction)
(Feed Rate: 400 mm/min)
(Origin: Bottom-left corner)

G21         ; Set units to millimeters
G90         ; Absolute positioning
G17         ; XY plane selection

; Rapid move to start position
G0 X93.564 Y145.000

; Cut outline
G1 X109.333 Y145.000 F400
G1 X204.650 Y37.886 F400
G1 X199.744 Y0.344 F400
G1 X5.607 Y1.033 F400
G1 X0.000 Y22.043 F400
G1 X1.752 Y39.952 F400
G1 X93.564 Y145.000 F400

; Return to origin
G0 X0 Y0

M30         ; Program end
%`;

        document.getElementById('gcodeInput').value = sampleGcode;
        this.parseGcode();
    }

    parseGcode() {
        const gcodeText = document.getElementById('gcodeInput').value;
        const lines = gcodeText.split('\n');

        this.commands = [];
        let currentX = 0;
        let currentY = 0;
        let currentFeedRate = 0;
        let g0Count = 0;
        let g1Count = 0;

        // Reset bounding box
        this.minX = Infinity;
        this.maxX = -Infinity;
        this.minY = Infinity;
        this.maxY = -Infinity;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip comments and empty lines
            if (!line || line.startsWith('(') || line.startsWith(';') || line.startsWith('%')) {
                continue;
            }

            // Remove inline comments
            const codePart = line.split(';')[0].trim();
            if (!codePart) continue;

            // Parse G0/G1 commands
            const g0Match = codePart.match(/G0\s*/i);
            const g1Match = codePart.match(/G1\s*/i);

            if (g0Match || g1Match) {
                const isRapid = !!g0Match;

                // Parse X coordinate
                const xMatch = codePart.match(/X([-\d.]+)/i);
                if (xMatch) currentX = parseFloat(xMatch[1]);

                // Parse Y coordinate
                const yMatch = codePart.match(/Y([-\d.]+)/i);
                if (yMatch) currentY = parseFloat(yMatch[1]);

                // Parse feed rate
                const fMatch = codePart.match(/F([\d.]+)/i);
                if (fMatch) currentFeedRate = parseFloat(fMatch[1]);

                // Update bounding box
                this.minX = Math.min(this.minX, currentX);
                this.maxX = Math.max(this.maxX, currentX);
                this.minY = Math.min(this.minY, currentY);
                this.maxY = Math.max(this.maxY, currentY);

                // Store command
                this.commands.push({
                    type: isRapid ? 'G0' : 'G1',
                    x: currentX,
                    y: currentY,
                    feedRate: currentFeedRate,
                    lineNumber: i + 1
                });

                if (isRapid) g0Count++;
                else g1Count++;
            }
        }

        // Handle empty input
        if (this.commands.length === 0) {
            this.minX = 0;
            this.maxX = 100;
            this.minY = 0;
            this.maxY = 100;
        }

        // Update stats
        document.getElementById('statLines').textContent = lines.length;
        document.getElementById('statG0').textContent = g0Count;
        document.getElementById('statG1').textContent = g1Count;
        document.getElementById('bboxX').textContent = `${this.minX.toFixed(1)} - ${this.maxX.toFixed(1)}`;
        document.getElementById('bboxY').textContent = `${this.minY.toFixed(1)} - ${this.maxY.toFixed(1)}`;
        document.getElementById('bboxWidth').textContent = `${(this.maxX - this.minX).toFixed(1)} mm`;
        document.getElementById('bboxHeight').textContent = `${(this.maxY - this.minY).toFixed(1)} mm`;

        this.calculateView();
        this.reset();
    }

    calculateView() {
        const width = this.maxX - this.minX;
        const height = this.maxY - this.minY;

        if (width === 0 && height === 0) return;

        // Calculate scale to fit canvas with padding
        const scaleX = (this.canvas.width - this.padding * 2) / width;
        const scaleY = (this.canvas.height - this.padding * 2) / height;
        this.scale = Math.min(scaleX, scaleY) * 0.9;

        // Calculate offset to center the drawing
        this.offsetX = this.padding + (this.canvas.width - this.padding * 2 - width * this.scale) / 2 - this.minX * this.scale;
        this.offsetY = this.padding + (this.canvas.height - this.padding * 2 - height * this.scale) / 2 - this.minY * this.scale;
    }

    worldToCanvas(x, y) {
        return {
            x: x * this.scale + this.offsetX,
            y: this.canvas.height - (y * this.scale + this.offsetY) // Flip Y for canvas
        };
    }

    canvasToWorld(canvasX, canvasY) {
        return {
            x: (canvasX - this.offsetX) / this.scale,
            y: (this.canvas.height - canvasY - this.offsetY) / this.scale
        };
    }

    showCursorPosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        const world = this.canvasToWorld(canvasX, canvasY);
        document.getElementById('cursorPos').textContent = `X: ${world.x.toFixed(2)} Y: ${world.y.toFixed(2)}`;
    }

    draw() {
        const ctx = this.ctx;

        // Clear canvas
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw axes
        this.drawAxes();

        // Draw complete path (preview)
        this.drawCompletePath();

        // Draw animated path history
        this.drawPathHistory();

        // Draw tool position
        this.drawTool();
    }

    drawGrid() {
        const ctx = this.ctx;
        const gridSize = 10; // 10mm grid

        // Calculate grid range
        const startX = Math.floor(this.minX / gridSize) * gridSize;
        const endX = Math.ceil(this.maxX / gridSize) * gridSize;
        const startY = Math.floor(this.minY / gridSize) * gridSize;
        const endY = Math.ceil(this.maxY / gridSize) * gridSize;

        ctx.lineWidth = 1;

        // Draw vertical lines
        for (let x = startX; x <= endX; x += gridSize) {
            const isMajor = x % 50 === 0;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;

            const start = this.worldToCanvas(x, startY);
            const end = this.worldToCanvas(x, endY);

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = startY; y <= endY; y += gridSize) {
            const isMajor = y % 50 === 0;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;

            const start = this.worldToCanvas(startX, y);
            const end = this.worldToCanvas(endX, y);

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
    }

    drawAxes() {
        const ctx = this.ctx;
        const origin = this.worldToCanvas(0, 0);

        ctx.strokeStyle = this.colors.axis;
        ctx.lineWidth = 2;

        // X axis
        ctx.beginPath();
        ctx.moveTo(this.padding, origin.y);
        ctx.lineTo(this.canvas.width - this.padding, origin.y);
        ctx.stroke();

        // Y axis
        ctx.beginPath();
        ctx.moveTo(origin.x, this.padding);
        ctx.lineTo(origin.x, this.canvas.height - this.padding);
        ctx.stroke();

        // Origin marker
        ctx.fillStyle = this.colors.axis;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Labels
        ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
        ctx.font = '12px monospace';
        ctx.fillText('X', this.canvas.width - this.padding + 10, origin.y + 4);
        ctx.fillText('Y', origin.x - 4, this.padding - 10);
        ctx.fillText('0', origin.x + 8, origin.y + 15);
    }

    drawCompletePath() {
        if (this.commands.length < 2) return;

        const ctx = this.ctx;
        ctx.globalAlpha = 0.2;

        let prevPos = this.worldToCanvas(0, 0);

        for (const cmd of this.commands) {
            const pos = this.worldToCanvas(cmd.x, cmd.y);

            ctx.strokeStyle = cmd.type === 'G0' ? this.colors.rapid : this.colors.linear;
            ctx.lineWidth = cmd.type === 'G0' ? 1 : 2;

            if (cmd.type === 'G0') {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.beginPath();
            ctx.moveTo(prevPos.x, prevPos.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();

            prevPos = pos;
        }

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    drawPathHistory() {
        if (this.pathHistory.length < 2) return;

        const ctx = this.ctx;

        for (let i = 1; i < this.pathHistory.length; i++) {
            const prev = this.pathHistory[i - 1];
            const curr = this.pathHistory[i];

            const prevPos = this.worldToCanvas(prev.x, prev.y);
            const currPos = this.worldToCanvas(curr.x, curr.y);

            ctx.strokeStyle = curr.type === 'G0' ? this.colors.rapid : this.colors.linear;
            ctx.lineWidth = curr.type === 'G0' ? 2 : 3;

            if (curr.type === 'G0') {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.beginPath();
            ctx.moveTo(prevPos.x, prevPos.y);
            ctx.lineTo(currPos.x, currPos.y);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    drawTool() {
        const ctx = this.ctx;
        const pos = this.worldToCanvas(this.toolX, this.toolY);

        // Glow effect
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 20);
        gradient.addColorStop(0, 'rgba(255, 68, 102, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 68, 102, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 68, 102, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
        ctx.fill();

        // Tool center
        ctx.fillStyle = this.colors.tool;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Inner dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    startSimulation() {
        if (this.commands.length === 0) {
            this.parseGcode();
            if (this.commands.length === 0) return;
        }

        if (this.isPaused) {
            this.isPaused = false;
            this.isRunning = true;
            this.updateStatus('Running');
            this.animate();
            return;
        }

        this.reset();
        this.isRunning = true;
        this.updateStatus('Running');
        document.getElementById('pauseBtn').disabled = false;
        this.animate();
    }

    togglePause() {
        if (this.isRunning) {
            this.isPaused = true;
            this.isRunning = false;
            this.updateStatus('Paused');
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        } else if (this.isPaused) {
            this.startSimulation();
        }
    }

    reset() {
        this.isRunning = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.toolX = 0;
        this.toolY = 0;
        this.feedRate = 0;
        this.pathHistory = [{ x: 0, y: 0, type: 'start' }];

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        this.updateStatus('Ready');
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('progressBar').style.setProperty('--progress', '0%');
        document.getElementById('progressText').textContent = '0%';
        document.getElementById('statCurrentLine').textContent = '0';

        this.updateToolPosition();
        this.draw();
    }

    animate() {
        if (!this.isRunning || this.currentIndex >= this.commands.length) {
            if (this.currentIndex >= this.commands.length) {
                this.isRunning = false;
                this.updateStatus('Complete');
                document.getElementById('pauseBtn').disabled = true;
            }
            return;
        }

        const cmd = this.commands[this.currentIndex];

        // Calculate step based on speed
        const distance = Math.sqrt(
            Math.pow(cmd.x - this.toolX, 2) +
            Math.pow(cmd.y - this.toolY, 2)
        );

        const stepSize = (this.speed / 25) * (cmd.type === 'G0' ? 3 : 1);

        if (distance < stepSize) {
            // Reached target, move to next command
            this.toolX = cmd.x;
            this.toolY = cmd.y;
            this.feedRate = cmd.feedRate;

            this.pathHistory.push({
                x: cmd.x,
                y: cmd.y,
                type: cmd.type
            });

            this.currentIndex++;

            // Update progress
            const progress = (this.currentIndex / this.commands.length) * 100;
            document.getElementById('progressBar').style.setProperty('--progress', `${progress}%`);
            document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
            document.getElementById('statCurrentLine').textContent = cmd.lineNumber;
            document.getElementById('statFeedRate').textContent = this.feedRate;
        } else {
            // Interpolate position
            const ratio = stepSize / distance;
            this.toolX += (cmd.x - this.toolX) * ratio;
            this.toolY += (cmd.y - this.toolY) * ratio;
        }

        this.updateToolPosition();
        this.draw();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updateToolPosition() {
        document.getElementById('toolX').textContent = this.toolX.toFixed(3);
        document.getElementById('toolY').textContent = this.toolY.toFixed(3);
    }

    updateStatus(status) {
        const indicator = document.getElementById('statusIndicator');
        indicator.textContent = status;
        indicator.className = 'status-indicator';

        if (status === 'Running') {
            indicator.classList.add('running');
        } else if (status === 'Paused') {
            indicator.classList.add('paused');
        }
    }

    // ===== Chat Functionality =====

    initChat() {
        this.chatPanel = document.getElementById('chatPanel');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSendBtn = document.getElementById('chatSendBtn');
        this.chatToggle = document.getElementById('chatToggle');
        this.chatHeader = document.getElementById('chatHeader');

        // API endpoint for AI assistant
        this.aiEndpoint = 'https://gcode-simulator.randunun.workers.dev';

        // Start collapsed
        this.chatPanel.classList.add('collapsed');

        // Toggle chat
        this.chatHeader.addEventListener('click', () => {
            this.chatPanel.classList.toggle('collapsed');
        });

        // Send message - only on button click, not Enter key
        this.chatSendBtn.addEventListener('click', () => this.sendChatMessage());
    }

    async sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        // Add user message
        this.addChatMessage(message, 'user');
        this.chatInput.value = '';

        // Add loading indicator
        const loadingDiv = this.addChatMessage('Thinking...', 'assistant', true);

        try {
            const currentGcode = document.getElementById('gcodeInput').value;

            const response = await fetch(this.aiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, currentGcode })
            });

            const data = await response.json();

            // Remove loading
            loadingDiv.remove();

            if (data.success) {
                this.addChatMessage(data.response, 'assistant');

                // Check if response contains G-code to apply
                const gcodeMatch = data.response.match(/```gcode\n([\s\S]*?)```/);
                if (gcodeMatch) {
                    this.offerGcodeApplication(gcodeMatch[1]);
                }
            } else {
                this.addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
            }
        } catch (error) {
            loadingDiv.remove();
            // Fallback for when worker isn't deployed yet
            this.handleOfflineChat(message);
        }
    }

    addChatMessage(content, role, isLoading = false) {
        const div = document.createElement('div');
        div.className = `chat-message ${role}${isLoading ? ' loading' : ''}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Simple markdown-like formatting
        content = content
            .replace(/```gcode\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        contentDiv.innerHTML = content;
        div.appendChild(contentDiv);
        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        return div;
    }

    offerGcodeApplication(gcode) {
        const div = document.createElement('div');
        div.className = 'chat-message assistant';
        div.innerHTML = `
            <div class="message-content">
                <button class="btn btn-success" style="width:100%;margin-top:8px" onclick="window.simulator.applyGcode(\`${gcode.replace(/`/g, '\\`')}\`)">
                    ✓ Apply this G-code
                </button>
            </div>
        `;
        this.chatMessages.appendChild(div);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    applyGcode(gcode) {
        const textarea = document.getElementById('gcodeInput');
        textarea.value = gcode.trim();
        this.parseGcode();
        this.addChatMessage('G-code applied! Click Simulate to preview.', 'assistant');
    }

    handleOfflineChat(message) {
        // Basic offline responses
        const lower = message.toLowerCase();
        let response = '';

        if (lower.includes('circle')) {
            const match = message.match(/(\d+)\s*,\s*(\d+)/);
            const radiusMatch = message.match(/radius\s*(\d+)/i);
            const x = match ? match[1] : 50;
            const y = match ? match[2] : 50;
            const r = radiusMatch ? radiusMatch[1] : 20;

            response = `Here's a circle at (${x}, ${y}) with radius ${r}mm:\n\`\`\`gcode\nG21\nG90\nG0 Z5\nG0 X${parseInt(x) + parseInt(r)} Y${y}\nG0 Z-1\n`;
            for (let i = 1; i <= 36; i++) {
                const angle = (i / 36) * 2 * Math.PI;
                const cx = parseInt(x) + parseInt(r) * Math.cos(angle);
                const cy = parseInt(y) + parseInt(r) * Math.sin(angle);
                response += `G1 X${cx.toFixed(2)} Y${cy.toFixed(2)} F400\n`;
            }
            response += `G0 Z5\n\`\`\``;
        } else if (lower.includes('rectangle') || lower.includes('square')) {
            response = `Here's a 50x30mm rectangle:\n\`\`\`gcode\nG21\nG90\nG0 Z5\nG0 X0 Y0\nG0 Z-1\nG1 X50 Y0 F400\nG1 X50 Y30 F400\nG1 X0 Y30 F400\nG1 X0 Y0 F400\nG0 Z5\n\`\`\``;
        } else if (lower.includes('g0') || lower.includes('g1')) {
            response = `**G0** = Rapid move (tool up, fast travel)\n**G1** = Linear move (tool down, cutting/drawing)\n\nExample:\n\`G0 X10 Y10\` - Move quickly to (10,10)\n\`G1 X20 Y20 F400\` - Cut to (20,20) at 400mm/min`;
        } else {
            response = `I'm running in offline mode. Deploy the Cloudflare Worker for full AI features!\n\nI can still help with:\n- "Add a circle at 50,50 radius 20"\n- "Add a rectangle"\n- "What is G0 and G1?"`;
        }

        this.addChatMessage(response, 'assistant');

        // Check for G-code in response
        const gcodeMatch = response.match(/```gcode\n([\s\S]*?)```/);
        if (gcodeMatch) {
            this.offerGcodeApplication(gcodeMatch[1]);
        }
    }
}

// Initialize simulator when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new GCodeSimulator();
    window.simulator.initChat();
});

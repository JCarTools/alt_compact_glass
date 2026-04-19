(()=>{
  const TURN_LEFT_TYPES = new Set([2, 4, 6, 8]);
  const TURN_RIGHT_TYPES = new Set([3, 5, 7, 19]);
  const TURN_STRAIGHT_TYPES = new Set([9, 15, 49]);
  const TURN_ROUND_TYPES = new Set([24, 55]);

  class PseudoRouteMap {
    constructor(root, canvas){
      this.root = root;
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
      this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      this.state = {
        visible:false,
        turnType:9,
        turnDist:1000,
        remainDist:1000,
        speed:0,
        heading:0
      };
      this.renderState = {
        progress:0,
        speed:0,
        heading:0,
        pulse:0
      };
      this.lastFrame = performance.now();
      this.resize();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize(){
      if(!this.canvas || !this.ctx) return;
      const width = this.canvas.clientWidth || this.canvas.width;
      const height = this.canvas.clientHeight || this.canvas.height;
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.width = width;
      this.height = height;
    }

    setVisible(visible){
      this.state.visible = !!visible;
      if(this.root){
        this.root.classList.toggle("visible", this.state.visible);
      }
    }

    update(data){
      this.state.turnType = Number(data.turnType) || 9;
      this.state.turnDist = Math.max(0, Number(data.turnDist) || 0);
      this.state.remainDist = Math.max(this.state.turnDist, Number(data.remainDist) || this.state.turnDist || 0);
      this.state.speed = this.resolveSpeed(data);
      if(data.heading !== undefined){
        this.state.heading = Number(data.heading) || 0;
      }
    }

    updateGps(data){
      if(data.speed !== undefined){
        const speed = Number(data.speed);
        if(Number.isFinite(speed)){
          this.state.speed = Math.max(0, speed);
        }
      }
      if(data.heading !== undefined){
        const heading = Number(data.heading);
        if(Number.isFinite(heading)){
          this.state.heading = heading;
        }
      }
    }

    resolveSpeed(data){
      const raw = Number(
        data.currentSpeed ??
        data.gpsSpeed ??
        data.speed ??
        data.vehicleSpeed ??
        data.navSpeed ??
        0
      );
      return Number.isFinite(raw) ? Math.max(0, raw) : 0;
    }

    getTurnKind(turnType){
      if(TURN_LEFT_TYPES.has(turnType)) return "left";
      if(TURN_RIGHT_TYPES.has(turnType)) return "right";
      if(TURN_ROUND_TYPES.has(turnType)) return "round";
      if(TURN_STRAIGHT_TYPES.has(turnType)) return "straight";
      return "straight";
    }

    getTargetProgress(){
      const dist = Math.max(0, this.state.turnDist);
      if(dist >= 10000) return 0.04;
      if(dist >= 5000) return 0.08;
      if(dist >= 2000) return 0.14;
      if(dist >= 1000) return 0.22;
      if(dist >= 500) return 0.34;
      if(dist >= 200) return 0.48;
      if(dist >= 100) return 0.62;
      if(dist >= 50) return 0.76;
      if(dist >= 20) return 0.86;
      if(dist >= 10) return 0.92;
      if(dist >= 3) return 0.97;
      return 1;
    }

    lerp(from, to, factor){
      return from + (to - from) * factor;
    }

    loop(now){
      const dt = Math.min(0.06, (now - this.lastFrame) / 1000 || 0.016);
      this.lastFrame = now;
      this.tick(dt, now / 1000);
      requestAnimationFrame(this.loop);
    }

    tick(dt, time){
      if(!this.ctx || !this.width || !this.height) return;

      const targetProgress = this.state.visible ? this.getTargetProgress() : 0;
      const speedBoost = Math.min(1.8, 0.75 + (this.state.speed / 120));
      this.renderState.progress = this.lerp(this.renderState.progress, targetProgress, dt * 2.6 * speedBoost);
      this.renderState.speed = this.lerp(this.renderState.speed, this.state.speed, dt * 3);
      this.renderState.pulse += dt * (1.2 + this.renderState.speed / 90);

      this.draw(time);
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const kind = this.getTurnKind(this.state.turnType);
      const progress = this.renderState.progress;
      const path = this.buildPath(kind, progress, width, height);
      const carPoint = path.carPoint;

      ctx.clearRect(0, 0, width, height);

      this.drawBackground(ctx, width, height, time);
      this.drawRouteGlow(ctx, path.points, "#0e2f42", 10, 0.14);
      this.drawPath(ctx, path.points, "rgba(255,255,255,.12)", 9);
      this.drawPath(ctx, path.points, "#f4fbff", 4.2);
      this.drawApproachTrail(ctx, path.points, path.carIndex);
      this.drawGuides(ctx, path, kind);
      this.drawManeuver(ctx, path, kind, progress, time);
      this.drawCar(ctx, carPoint, time);
    }

    drawBackground(ctx, width, height, time){
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(14,22,32,.96)");
      gradient.addColorStop(1, "rgba(7,13,21,.92)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = "rgba(152,179,201,.18)";
      ctx.lineWidth = 1;
      for(let x = 10; x < width; x += 14){
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for(let y = 12; y < height; y += 14){
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(time * 0.6 + y * 0.015) * 0.8);
        ctx.lineTo(width, y + Math.sin(time * 0.6 + y * 0.015) * 0.8);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "rgba(92,116,138,.22)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(width * 0.12, height * 0.24);
      ctx.lineTo(width * 0.84, height * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width * 0.08, height * 0.62);
      ctx.lineTo(width * 0.9, height * 0.52);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(width * 0.18, height * 0.9);
      ctx.lineTo(width * 0.82, height * 0.78);
      ctx.stroke();
      ctx.restore();
    }

    buildPath(kind, progress, width, height){
      const cx = width * 0.5;
      const carY = height - 14;
      const top = 8;
      const offset = Math.min(24, width * 0.22);
      const points = [];
      const showManeuver = progress > 0.18;
      const turnProgress = Math.max(0, (progress - 0.8) / 0.2);
      const turnY = this.getTurnY(progress, height);
      const postTurnLength = Math.max(18, height * 0.2);

      const addLine = (x1, y1, x2, y2, segments = 12) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          points.push({
            x: this.lerp(x1, x2, t),
            y: this.lerp(y1, y2, t)
          });
        }
      };

      const addQuadratic = (x1, y1, cx1, cy1, x2, y2, segments = 18) => {
        for(let i = 0; i <= segments; i++){
          const t = i / segments;
          const mt = 1 - t;
          points.push({
            x: mt * mt * x1 + 2 * mt * t * cx1 + t * t * x2,
            y: mt * mt * y1 + 2 * mt * t * cy1 + t * t * y2
          });
        }
      };

      if(!showManeuver){
        addLine(cx, carY, cx, top, 28);
      }else if(kind === "left"){
        addLine(cx, carY, cx, turnY + 14, 20);
        addQuadratic(cx, turnY + 14, cx, turnY - 2, cx - offset, turnY - 2, 24);
        addLine(cx - offset, turnY - 2, cx - offset, Math.max(top, turnY - postTurnLength), 12);
      }else if(kind === "right"){
        addLine(cx, carY, cx, turnY + 14, 20);
        addQuadratic(cx, turnY + 14, cx, turnY - 2, cx + offset, turnY - 2, 24);
        addLine(cx + offset, turnY - 2, cx + offset, Math.max(top, turnY - postTurnLength), 12);
      }else if(kind === "round"){
        const radius = Math.min(14, width * 0.17);
        addLine(cx, carY, cx, turnY + radius + 12, 18);
        for(let i = 0; i <= 34; i++){
          const angle = Math.PI * 0.56 + (Math.PI * 1.42 * (i / 34));
          points.push({
            x: cx + Math.cos(angle) * radius,
            y: turnY + Math.sin(angle) * radius
          });
        }
        addLine(cx + radius, turnY, cx + radius, Math.max(top, turnY - postTurnLength), 10);
      }else{
        addLine(cx, carY, cx, top, 34);
      }

      const carIndex = this.findClosestPointIndex(points, cx, carY);
      return {
        points,
        turnY,
        centerX:cx,
        carPoint:{x:cx, y:carY},
        carIndex,
        turnProgress,
        offset,
        showManeuver
      };
    }

    getTurnY(progress, height){
      const farY = -26;
      const nearY = height * 0.42;
      const eased = Math.pow(progress, 0.92);
      return this.lerp(farY, nearY, eased);
    }

    getPointAt(points, t){
      if(!points.length) return {x:0, y:0};
      if(points.length === 1) return points[0];
      const scaled = Math.max(0, Math.min(0.999, t)) * (points.length - 1);
      const index = Math.floor(scaled);
      const localT = scaled - index;
      const p1 = points[index];
      const p2 = points[Math.min(points.length - 1, index + 1)];
      return {
        x: this.lerp(p1.x, p2.x, localT),
        y: this.lerp(p1.y, p2.y, localT)
      };
    }

    findClosestPointIndex(points, x, y){
      let bestIndex = 0;
      let bestDistance = Infinity;
      for(let i = 0; i < points.length; i++){
        const dx = points[i].x - x;
        const dy = points[i].y - y;
        const distance = dx * dx + dy * dy;
        if(distance < bestDistance){
          bestDistance = distance;
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    drawPath(ctx, points, color, width){
      if(points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for(let i = 1; i < points.length; i++){
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawRouteGlow(ctx, points, color, width, alpha){
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawPath(ctx, points, color, width);
      ctx.restore();
    }

    drawApproachTrail(ctx, points, carIndex){
      if(points.length < 2) return;
      const startIndex = Math.max(0, carIndex - 18);
      ctx.save();
      ctx.strokeStyle = "#4ec7ff";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[startIndex].x, points[startIndex].y);
      for(let i = startIndex + 1; i <= carIndex; i++){
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawGuides(ctx, path, kind){
      if(kind === "straight" || !path.showManeuver) return;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(path.centerX, this.height - 10);
      ctx.lineTo(path.centerX, path.turnY - 8);
      ctx.stroke();
      ctx.restore();
    }

    drawManeuver(ctx, path, kind, progress, time){
      if(!path.showManeuver) return;
      const pulse = 0.5 + Math.sin(this.renderState.pulse * 3.2 + time * 1.4) * 0.5;
      const accent = progress > 0.72 ? "#ffd166" : "#6fd3ff";
      const anchor = this.getPointAt(path.points, kind === "straight" ? 0.76 : 0.58);

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.globalAlpha = 0.14 + pulse * 0.12;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 8 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;

      if(kind === "left" || kind === "right"){
        const dir = kind === "left" ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(anchor.x - dir * 4, anchor.y);
        ctx.lineTo(anchor.x + dir * 6, anchor.y);
        ctx.stroke();
      }else if(kind === "round"){
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 6, Math.PI * 0.15, Math.PI * 1.8);
        ctx.stroke();
      }else{
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y + 6);
        ctx.lineTo(anchor.x, anchor.y - 6);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawCar(ctx, point, time){
      const bob = Math.sin(time * 4.4) * 0.45;
      ctx.save();
      ctx.translate(point.x, point.y + bob);
      ctx.rotate(0);

      ctx.shadowColor = "rgba(78,199,255,.34)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#33b5ff";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.2, 6);
      ctx.lineTo(0, 3.2);
      ctx.lineTo(-5.2, 6);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, -2.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  window.PseudoRouteMap = PseudoRouteMap;
})();

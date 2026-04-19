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
      this.activeRoute = {
        turnType:9,
        turnDist:1000,
        remainDist:1000
      };
      this.pendingRoute = null;
      this.renderState = {
        progress:0,
        speed:0,
        heading:0,
        pulse:0,
        transitionT:1,
        exitProgress:0
      };
      this.transitionFromPoints = null;
      this.displayPoints = null;
      this.lastSignature = "";
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
      const nextTurnType = Number(data.turnType) || 9;
      const nextTurnDist = Math.max(0, Number(data.turnDist) || 0);
      const nextSignature = `${nextTurnType}:${nextTurnDist > 120 ? "far" : "near"}`;
      this.state.turnType = Number(data.turnType) || 9;
      this.state.turnDist = Math.max(0, Number(data.turnDist) || 0);
      this.state.remainDist = Math.max(this.state.turnDist, Number(data.remainDist) || this.state.turnDist || 0);
      this.state.speed = this.resolveSpeed(data);
      if(data.heading !== undefined){
        this.state.heading = Number(data.heading) || 0;
      }

      if(!this.lastSignature){
        this.activeRoute = {
          turnType:nextTurnType,
          turnDist:nextTurnDist,
          remainDist:this.state.remainDist
        };
        this.lastSignature = nextSignature;
        return;
      }

      const activeSignature = `${this.activeRoute.turnType}:${this.activeRoute.turnDist > 120 ? "far" : "near"}`;
      if(nextSignature === activeSignature || nextTurnType === this.activeRoute.turnType){
        this.activeRoute.turnDist = nextTurnDist;
        this.activeRoute.remainDist = this.state.remainDist;
        this.lastSignature = nextSignature;
        return;
      }

      this.pendingRoute = {
        turnType:nextTurnType,
        turnDist:nextTurnDist,
        remainDist:this.state.remainDist
      };
      this.lastSignature = nextSignature;
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

    getTargetProgress(distValue = this.activeRoute.turnDist){
      const dist = Math.max(0, Number(distValue) || 0);
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

      const speedBoost = Math.min(1.8, 0.75 + (this.state.speed / 120));
      const activeTargetProgress = this.state.visible ? this.getTargetProgress(this.activeRoute.turnDist) : 0;
      this.renderState.progress = this.lerp(this.renderState.progress, activeTargetProgress, dt * 2.2 * speedBoost);
      this.renderState.speed = this.lerp(this.renderState.speed, this.state.speed, dt * 3);
      this.renderState.pulse += dt * (1.2 + this.renderState.speed / 90);
      this.renderState.transitionT = Math.min(1, this.renderState.transitionT + dt * 2.4);

      const currentTurnDone = this.activeRoute.turnDist <= 1 || this.renderState.progress > 0.995;
      if(currentTurnDone){
        this.renderState.exitProgress = Math.min(1, this.renderState.exitProgress + dt * 0.72);
      }else{
        this.renderState.exitProgress = 0;
      }

      if(this.pendingRoute && currentTurnDone && this.renderState.exitProgress >= 1){
        this.transitionFromPoints = this.displayPoints ? this.displayPoints.map(point => ({...point})) : null;
        this.renderState.transitionT = 0;
        this.activeRoute = {...this.pendingRoute};
        this.pendingRoute = null;
        this.renderState.progress = 0.04;
        this.renderState.exitProgress = 0;
      }

      this.draw(time);
    }

    draw(time){
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      const kind = this.getTurnKind(this.activeRoute.turnType);
      const visualProgress = this.renderState.progress;
      const path = this.buildPath(kind, visualProgress, width, height);
      const displayPoints = this.getDisplayPoints(path.points);
      const displayCarIndex = this.findClosestPointIndex(displayPoints, path.carPoint.x, path.carPoint.y);
      const displayPath = {
        ...path,
        points:displayPoints,
        carIndex:displayCarIndex
      };
      const carPoint = path.carPoint;

      ctx.clearRect(0, 0, width, height);

      this.drawBackground(ctx, width, height, time);
      this.drawRouteGlow(ctx, displayPath.points, "#0e2f42", 10, 0.14);
      this.drawPath(ctx, displayPath.points, "rgba(255,255,255,.12)", 9);
      this.drawPath(ctx, displayPath.points, "#f4fbff", 4.2);
      this.drawApproachTrail(ctx, displayPath.points, displayPath.carIndex);
      this.drawGuides(ctx, displayPath, kind);
      this.drawManeuver(ctx, displayPath, kind, visualProgress, time);
      this.drawCar(ctx, carPoint, time);
    }

    getDisplayPoints(targetPoints){
      const sampledTarget = this.samplePoints(targetPoints, 56);
      if(!this.transitionFromPoints || this.renderState.transitionT >= 1){
        this.displayPoints = sampledTarget;
        this.transitionFromPoints = sampledTarget;
        return sampledTarget;
      }

      const sampledFrom = this.samplePoints(this.transitionFromPoints, sampledTarget.length);
      const eased = 1 - Math.pow(1 - this.renderState.transitionT, 3);
      const blended = sampledTarget.map((point, index) => ({
        x: this.lerp(sampledFrom[index].x, point.x, eased),
        y: this.lerp(sampledFrom[index].y, point.y, eased)
      }));

      this.displayPoints = blended;
      if(this.renderState.transitionT >= 0.999){
        this.transitionFromPoints = sampledTarget;
      }
      return blended;
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
      const showManeuver = progress > 0.12;
      const approachProgress = Math.min(1, progress / 0.78);
      const turnProgress = Math.max(0, Math.min(1, (progress - 0.78) / 0.14));
      const exitProgress = Math.max(0, Math.min(1, Math.max(this.renderState.exitProgress, (progress - 0.92) / 0.08)));
      const turnY = this.getTurnY(approachProgress, height);
      const postTurnLength = Math.max(24, height * 0.34);

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
        const bendX = cx - offset * (0.28 + turnProgress * 0.72);
        const exitX = bendX - offset * (0.18 + exitProgress * 1.05);
        const exitY = turnY - postTurnLength * exitProgress;
        addLine(cx, carY, cx, turnY + 14, 22);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 28);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
      }else if(kind === "right"){
        const bendX = cx + offset * (0.28 + turnProgress * 0.72);
        const exitX = bendX + offset * (0.18 + exitProgress * 1.05);
        const exitY = turnY - postTurnLength * exitProgress;
        addLine(cx, carY, cx, turnY + 14, 22);
        addQuadratic(cx, turnY + 14, cx, turnY + 2, bendX, turnY - 2, 28);
        addLine(bendX, turnY - 2, exitX, exitY, 18);
      }else if(kind === "round"){
        const radius = Math.min(14, width * 0.17);
        const sweep = 0.3 + turnProgress * 1.12;
        const exitX = cx + radius + radius * 1.3 * exitProgress;
        const exitY = turnY - postTurnLength * exitProgress;
        addLine(cx, carY, cx, turnY + radius + 12, 18);
        for(let i = 0; i <= 34; i++){
          const angle = Math.PI * 0.56 + (Math.PI * sweep * (i / 34));
          points.push({
            x: cx + Math.cos(angle) * radius,
            y: turnY + Math.sin(angle) * radius
          });
        }
        addLine(cx + radius, turnY, exitX, exitY, 14);
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

    getTurnY(approachProgress, height){
      const carY = height - 14;
      const farY = -26;
      const nearY = carY - 16;
      const eased = Math.pow(Math.max(0, Math.min(1, approachProgress)), 0.96);
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

    samplePoints(points, count){
      if(!points || !points.length) return [];
      if(points.length === count) return points.map(point => ({...point}));
      const sampled = [];
      for(let i = 0; i < count; i++){
        const t = count === 1 ? 0 : i / (count - 1);
        sampled.push(this.getPointAt(points, t));
      }
      return sampled;
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
      const anchorT = progress > 0.92
        ? (kind === "straight" ? 0.9 : 0.76)
        : (kind === "straight" ? 0.78 : 0.66);
      const anchor = this.getPointAt(path.points, anchorT);

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

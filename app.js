 window.addEventListener("DOMContentLoaded", ()=>{

    const map = {
      2:"#ico_left",
      3:"#ico_right",
      4:"#ico_fork_left",
      5:"#ico_fork_right",
      6:"#ico_hard_left",
      7:"#ico_hard_right",
      8:"#ico_uturn_left",
      19:"#ico_uturn_right",
      9:"#ico_straight",
      24:"#ico_round",
      55:"#ico_out_round",
      15:"#ico_finish",
      49:"#ico_ferry",
      14:"#ico_radar"

    };

  let gpsInitialized = false

  function setGpsLevel(value){

      const gps = document.getElementById("gpsWidget")

      // если вообще нет значения → скрываем
      if(value === null || value === undefined){
          gps.classList.remove("visible")
          gpsInitialized = false
          return
      }

      // первое появление
      if(!gpsInitialized){
          gps.classList.add("visible")
          gpsInitialized = true
      }

      gps.classList.remove(
          "level-1",
          "level-2",
          "level-3",
          "level-4",
          "level-5",
          "low"
      )

      if(value < 14){
          gps.classList.add("low")
          return
      }

      if(value < 30){
          gps.classList.add("level-1")
          return
      }

      if(value < 50){
          gps.classList.add("level-2")
          return
      }

      if(value < 70){
          gps.classList.add("level-3")
          return
      }

      if(value < 80){
          gps.classList.add("level-4")
          return
      }

      gps.classList.add("level-5")
  }

    //setGpsLevel(25);

    let state = {
        navi:false,
        radar:false
    }

    const panel = document.getElementById("hudPanel");
    const turnUse = document.getElementById("turnUse");
    const dist = document.getElementById("distance");
    //const remainDist = document.getElementById("remainDist");
    const road = document.getElementById("road");
    const limit = document.getElementById("limit");


const hudTop = document.getElementById('hudPanelTop');
const hudRow = document.querySelector('.hud-row');
const routeMapRoot = document.getElementById("routeMap");
const routeMapCanvas = document.getElementById("routeMapCanvas");
const routeMap = new PseudoRouteMap(routeMapRoot, routeMapCanvas);
window.addEventListener("resize", ()=> routeMap.resize());
//const turnUseTop = document.getElementById("turnUseTop");
const distanceTop = document.getElementById("distanceTop");
const limitTop = document.getElementById("limitTop");

function layout(){
    const dualHud = state.navi && state.radar

    // visibility
    if(state.navi){
        panel.classList.add("show")
        panel.classList.add("visible")
    }else{
        panel.classList.remove("show")
        panel.classList.remove("visible")
    }

    // radar visibility
    if(state.radar){
        hudTop.classList.add("show")
    }else{
        hudTop.classList.remove("show")
    }

    if(state.radar){
        panel.classList.add("both")
    }else{
        panel.classList.remove("both")
    }

    hudRow.classList.toggle("compact-dual", dualHud)
    hudRow.classList.toggle("solo-radar", state.radar && !state.navi)
    hudRow.classList.toggle("solo-navi", state.navi && !state.radar)
    routeMap.setVisible(state.navi)
}

function test(){
    document.body.style.background = "#000";
    state.radar = true;
    state.navi = true;
    layout();
    setGpsLevel(65);
}

window.onAndroidEvent = function(type,data){

      if(type == "gps"){
        routeMap.updateGps(data || {})
        return
      }

      if(type == "GPSSignalQuality"){
        setGpsLevel(data.updateSignalQuality)
        return
      }

      if(type !== "hud") return;
      if(!panel||!hudTop) return;

if ("ARAD" == data.hudSenderType){
      state.radar = data.aradarOn
          layout()

      if(data.aradarOn){

        //turnUseTop.setAttribute("href", map[data.turnType] || "#ico_straight");

        let dis = data.remainDist;

        if(dis<1000){
            distanceTop.innerText = dis  + " m";
        }else{
            distanceTop.innerText = dis/1000  + " km";
        }

        distanceTop.style.transform = "scale(1.25)";
        setTimeout(()=>distanceTop.style.transform="scale(1)",120);

        limitTop.innerText = data.speedLimit || "";
        hudTop.classList.toggle("urgent", dis < 250);

      }
      else{
        hudTop.classList.remove("urgent")
      }
}

     if ("NAVI" == data.hudSenderType){
        state.navi = data.naviOn
        layout()
      if(data.naviOn){
        turnUse.setAttribute("href", map[data.turnType] || "#ico_straight");
        routeMap.update(data);

              const tdis = data.turnDist;
              const rdis = data.remainDist;
              const nextRoad = data.nextRoad;

              let dis = tdis;

              if(dis<1000){
                dist.innerText = dis  + " m";
              }else{
                dist.innerText = dis/1000  + " km";
              }
/*
              if(dis<1000){
                 remainDist.innerText = "";
                 remainDist.classList.add("hidden")
              }else{
                 remainDist.innerText = rdis/1000  + " km";
                 remainDist.classList.remove("hidden")
              }
*/

              const iconSvg = turnUse.closest("svg");

              if(data.turnDist < 80){
                iconSvg.style.filter = "drop-shadow(0 0 14px red)";
                panel.classList.add("urgent")
              }else{
                iconSvg.style.filter = "none";
                panel.classList.remove("urgent")
              }

              road.innerText = nextRoad || "";
              limit.innerText = data.speedLimit || "";

      }
      else{
        panel.classList.remove("urgent")
        road.innerText = ""
        routeMap.update({
          turnType:9,
          turnDist:0,
          remainDist:0,
          currentSpeed:0
        })
      }
    }
    }


    //test();



});

//console.log("androidApi =", window.androidApi);
const TOKEN = "SECURE_TOKEN_2025";

if (window.androidApi && androidApi.onJsReady) {
  androidApi.onJsReady(TOKEN);
}

let map;
let directionsService;
let placesService;
let geocoder;
let currentModeRoutes = [];
const googleApiKey = "AIzaSyCsGmR_ZBquX6_QH5k58LbN-kulY0EJ7Gg";
const weatherKey = "cf17be40031abe6fd4ef463643ddcf4f";
const routePolylines = [];
let selectedRow = null;

window.onload = () => {
  loadGoogleMapScript();
  document.getElementById("searchBtn").addEventListener("click", () => {
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;
    if (!start || !end) {
      alert("請輸入起點與終點");
      return;
    }
    planGoogleRoutes(start, end);
    checkWeatherByGeocode(end);
  });
};

function loadGoogleMapScript() {
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places,geometry&callback=initMap`;
  script.async = true;
  document.head.appendChild(script);
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 25.033964, lng: 121.564468 },
    zoom: 11,
  });
  directionsService = new google.maps.DirectionsService();
  placesService = new google.maps.places.PlacesService(map);
  geocoder = new google.maps.Geocoder();

  new google.maps.places.Autocomplete(document.getElementById("start"), {
    types: ["establishment"], componentRestrictions: { country: "tw" }
  });
  new google.maps.places.Autocomplete(document.getElementById("end"), {
    types: ["establishment"], componentRestrictions: { country: "tw" }
  });
}

function planGoogleRoutes(start, end) {
  const modes = ["DRIVING", "BICYCLING"];
  currentModeRoutes = [];

  Promise.all(modes.map(mode => getGoogleRoute(mode, start, end)))
    .then(results => {
      const baseRoutes = results.filter(Boolean);
      const sampleDist = baseRoutes[0]?.distance || 0;

      getTransitRouteSubway(start, end).then(transitRoute => {
        if (transitRoute) baseRoutes.push(transitRoute);

        // 🟢 加入 SkyRail 直線計算
        Promise.all([geocodeAddress(start), geocodeAddress(end)]).then(([startLoc, endLoc]) => {
          if (startLoc && endLoc) {
            const distance2 = google.maps.geometry.spherical.computeDistanceBetween(startLoc, endLoc) / 1000;

            // 畫直線
            const skyrailLine = new google.maps.Polyline({
              path: [startLoc, endLoc],
              strokeColor: "#00cc99",
              strokeOpacity: 0.8,
              strokeWeight: 5,
              map: map
            });
            routePolylines.push(skyrailLine);

            baseRoutes.push({
              mode: "SKYRAIL",
              speed: 50,
              distance: distance2,
              time: `${Math.round((distance2 / 50) * 60)} 分鐘`,
              co2: 10 * distance2,
              tip: "使用 SkyRail 最低碳排",
              color: "#00cc99",
              polyline: google.maps.geometry.encoding.encodePath([startLoc, endLoc])
            });
          }

          baseRoutes.push({
            mode: "MOTORCYCLE",
            speed: 60,
            distance: sampleDist,
            time: `${Math.round((sampleDist / 60) * 60)} 分鐘`,
            co2: 90 * sampleDist,
            tip: "最快但碳排高",
            color: "#ff6666",
            polyline: currentModeRoutes.find(r => r.mode === "DRIVING")?.polyline || null
          });

          showResults(baseRoutes);
        });
      });
    });
}

function getTransitRouteSubway(origin, destination) {
  return new Promise(resolve => {
    directionsService.route({
      origin, destination,
      travelMode: "TRANSIT",
      transitOptions: { modes: ["SUBWAY"] }
    }, (result, status) => {
      if (status === "OK") {
        const leg = result.routes[0].legs[0];
        const dist = leg.distance.value / 1000;
        const speed = 40;
        const time = `${Math.round((dist / speed) * 60)} 分鐘`;
        currentModeRoutes.push({ mode: "TRANSIT", polyline: result.routes[0].overview_polyline, color: "#3366cc" });
        resolve({
          mode: "TRANSIT",
          distance: dist,
          speed,
          time,
          co2: 40 * dist,
          tip: "適合通勤與雨天",
          color: "#3366cc",
          polyline: result.routes[0].overview_polyline
        });
      } else resolve(null);
    });
  });
}

function getGoogleRoute(mode, origin, destination) {
  return new Promise(resolve => {
    directionsService.route({
      origin, destination,
      travelMode: google.maps.TravelMode[mode]
    }, (result, status) => {
      if (status === "OK") {
        const leg = result.routes[0].legs[0];
        const dist = leg.distance.value / 1000;
        const color = mode === "DRIVING" ? "#ff9900" : "#66cc66";
        const speed = mode === "DRIVING" ? 70 : 20;
        const time = `${Math.round((dist / speed) * 60)} 分鐘`;
        const co2 = mode === "DRIVING" ? 150 * dist : 10 * dist;

        currentModeRoutes.push({ mode, polyline: result.routes[0].overview_polyline, color });

        resolve({
          mode,
          distance: dist,
          speed,
          time,
          co2,
          tip: mode === "DRIVING" ? "最快但碳排高" : "環保、輕鬆",
          color,
          polyline: result.routes[0].overview_polyline
        });
      } else resolve(null);
    });
  });
}

function geocodeAddress(address) {
  return new Promise(resolve => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === "OK" && results[0]) {
        resolve(results[0].geometry.location);
      } else {
        resolve(null);
      }
    });
  });
}

function showResults(routes) {
  const table = document.getElementById("resultTable");
  table.innerHTML = "";
  clearPolylines();

  const iconMap = {
    DRIVING: "🚗 開車", TRANSIT: "🚇 捷運", BICYCLING: "🚴 腳踏車",
    MOTORCYCLE: "🏍️ 機車", SKYRAIL: "🚝 SkyRail"
  };

  let minCo2 = Math.min(...routes.map(r => r.co2));
  let minTime = Math.min(...routes.map(r => parseInt(r.time)));

  routes.forEach(route => {
    let tip = "";
    const isLowest = route.co2 === minCo2;
    const isFastest = parseInt(route.time) === minTime;

    if (isLowest) {
      tip = `使用 ${iconMap[route.mode].split(" ")[1]} 最低碳排`;
    } else if (route.mode === "BICYCLING") {
      tip = "環保、輕鬆";
    } else if (route.mode === "TRANSIT") {
      tip = "適合通勤與雨天";
    } else if (isFastest) {
      tip = "最快但碳排高";
    } else {
      tip = route.tip || "依需求選擇";
    }

    const tr = document.createElement("tr");
    tr.classList.add("route-row");
    tr.innerHTML = `
      <td>${iconMap[route.mode]}</td>
      <td>${route.time}</td>
      <td>${route.speed ?? "-"} km/h</td>
      <td>${route.distance.toFixed(2)} km</td>
      <td>${route.co2.toFixed(1)} g</td>
      <td>${tip}</td>
    `;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      if (selectedRow) selectedRow.classList.remove("selected");
      tr.classList.add("selected");
      selectedRow = tr;
      drawPolyline(route);
    });
    table.appendChild(tr);
  });

  const lowestRoute = routes.find(r => r.co2 === minCo2);
  document.getElementById("summary").innerText = `最低碳排：${minCo2.toFixed(1)} 克 CO₂（${lowestRoute ? iconMap[lowestRoute.mode] : "未知"}）`;

  const defaultTr = table.querySelector("tr");
  if (defaultTr) {
    defaultTr.classList.add("selected");
    selectedRow = defaultTr;
    drawPolyline(routes[0]);
  }
}

function drawPolyline(route) {
  clearPolylines();
  if (!route.polyline) return;
  if (route.mode === "TRANSIT") return;
  const decoded = google.maps.geometry.encoding.decodePath(route.polyline);
  const polyline = new google.maps.Polyline({
    path: decoded,
    strokeColor: route.color || "#000",
    strokeOpacity: 0.8,
    strokeWeight: 5,
    map: map
  });
  routePolylines.push(polyline);
}

function clearPolylines() {
  routePolylines.forEach(p => p.setMap(null));
  routePolylines.length = 0;
}

function checkWeatherByGeocode(address) {
  const weatherTip = document.getElementById("weatherTip");
  weatherTip.innerHTML = "⌛ 查詢天氣與位置中...";
  geocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      const lat = location.lat();
      const lon = location.lng();
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherKey}&lang=zh_tw`)
        .then(res => res.json())
        .then(data => {
          const main = data.weather[0].main;
          weatherTip.innerHTML = main.includes("Rain") || main.includes("雷")
            ? "🌧️ 未來 3 小時可能降雨，建議攜帶雨具或搭 SkyRail"
            : "🌤️ 天氣良好，適合通勤、步行或腳踏車";
        })
        .catch(() => {
          weatherTip.innerHTML = "⚠️ 無法取得天氣資料，請稍後再試。";
        });
    } else {
      weatherTip.innerHTML = "⚠️ 無法解析地點為經緯度，請確認輸入是否正確。";
    }
  });
}

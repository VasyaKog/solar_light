(function () {
    const $ = (sel, root = document) => root.querySelector(sel);
    const formatNumber = (value) => {
        if (!Number.isFinite(value)) return "0.00";
        return value.toFixed(2);
    };
    const wattsToKw = (watts) => (Number.isFinite(watts) ? watts / 1000 : 0);

    const loadingOverlay = $("#loading-overlay");
    function showLoading() { if (loadingOverlay) loadingOverlay.classList.remove("hidden"); }
    function hideLoading() { if (loadingOverlay) loadingOverlay.classList.add("hidden"); }

    window.showLoading = showLoading;
    window.hideLoading = hideLoading;

    // ===== TILE STATE API =====
    const ROLE_TO_WIRE_CLASS = {
        solar: "wire-solar",
        grid: "wire-mid-a",
        load: "wire-mid-b",
        battery: "wire-bat"
    };

    function loadInverterData() {
        fetch('https://solar-panel-hpfk.onrender.com/api/solax/realtime').then(res => res.json()).then(data => {
            invertersData.update(data);
        });
    }

    class Inverter {
        STATE_OK = "ok";
        STATE_OFFLINE = "offline";
        constructor(sn) {
            this.state = this.STATE_OFFLINE;

            this.sn = sn ?? null;
            this.pvPower = null;
            this.batteryFlow = null;
            this.soc = null;
            this.gridFlow = null;
            this.gridStatus = null;
            this.consumption = null;
        }

        loadData(data) {
            if (!data) return;
            this.state = this.STATE_OK;

            this.pvPower = data.pvPower;
            this.batteryFlow = data.batteryFlow;
            this.soc = data.soc;
            this.gridFlow = data.gridFlow;
            this.gridStatus = data.gridStatus;
            this.consumption = data.consumption;
        }

        setStateOffline() {
            this.state = this.STATE_OFFLINE;
        }
    }

    class InvertersData {
        INVERTER_1_SN = 'SNPG285F4M';
        INVERTER_2_SN = 'SNKT6MEJKR';
        constructor() {
            this.inverter1 = new Inverter();
            this.inverter2 = new Inverter();
            this.totalConsumption = 0;
        }


        update(data) {
            console.log('update data', data);
            if (!data) return;

            let inv1 = data.inverters.find(inv => inv.sn === this.INVERTER_1_SN);
            let inv2 = data.inverters.find(inv => inv.sn === this.INVERTER_2_SN);

            if (inv1) {
                this.inverter1.loadData(inv1);
            } else {
                this.inverter1.setStateOffline();
            }

            if (inv2) {
                this.inverter2.loadData(inv2);
            } else {
                this.inverter2.setStateOffline();
            }

            this.totalConsumption = data.total.consumption;

            if (this.inverter1.state === this.inverter1.STATE_OFFLINE) setLineOffline("left");
            else setLineOk("left");
            if (this.inverter2.state === this.inverter2.STATE_OFFLINE) setLineOffline("right");
            else setLineOk("right");

            setSolarPower("left", wattsToKw(this.inverter1.pvPower));
            setSolarPower("right", wattsToKw(this.inverter2.pvPower));
            setSolarState("left", this.inverter1.pvPower);
            setSolarState("right", this.inverter2.pvPower);
            setLoadPower("left", wattsToKw(this.inverter1.consumption));
            setLoadPower("right", wattsToKw(this.inverter2.consumption));
            setBatteryFlow("left", wattsToKw(this.inverter1.batteryFlow));
            setBatteryFlow("right", wattsToKw(this.inverter2.batteryFlow));
            setBatteryPercent("left", this.inverter1.soc);
            setBatteryPercent("right", this.inverter2.soc);
            setBatteryState("left", this.inverter1.batteryFlow);
            setBatteryState("right", this.inverter2.batteryFlow);
            setGridPower("left", wattsToKw(-this.inverter1.gridFlow));
            setGridPower("right", wattsToKw(-this.inverter2.gridFlow));
            setGridState("left", -this.inverter1.gridFlow, this.inverter1.gridStatus);
            setGridState("right", -this.inverter2.gridFlow, this.inverter2.gridStatus);
            setTotalPower(wattsToKw(this.totalConsumption));

            console.log(this.inverter1, this.inverter2);
        }
    }

    function getColBySide(side) {
        return $(`.block-line-${side === "left" ? "1" : "2"}`);
    }

    function setTileState(side, role, state) {
        const col = getColBySide(side);
        if (!col) return;

        const tile = $(`.tile[data-role="${role}"]`, col);
        if (tile) tile.setAttribute("data-state", state);

        const wireClass = ROLE_TO_WIRE_CLASS[role];
        const wire = wireClass ? $(`.${wireClass}`, col) : null;
        if (wire) {
            if (state === "offline") wire.classList.add("wire--offline");
            else wire.classList.remove("wire--offline");
        }
    }

    function setSolarPower(side, value) {
        const col = getColBySide(side);
        if (!col) return;
        const tile = $(`#solar-${side}`, col);
        if (!tile) return;
        const valueEl = $(`[data-field="solar-power"]`, tile);
        if (valueEl) valueEl.textContent = formatNumber(value);
    }

    function setLoadPower(side, value) {
        const col = getColBySide(side);
        if (!col) return;
        const tile = $(`#load-${side}`, col);
        if (!tile) return;
        const valueEl = $(`[data-field="load-power"]`, tile);
        if (valueEl) valueEl.textContent = formatNumber(value);
    }

    function setBatteryFlow(side, value) {
        const col = getColBySide(side);
        if (!col) return;
        const tile = $(`#bat-${side}`, col);
        if (!tile) return;
        const valueEl = $(`[data-field="battery-flow"]`, tile);
        if (valueEl) valueEl.textContent = formatNumber(value);
    }

    function setBatteryPercent(side, value) {
        const col = getColBySide(side);
        if (!col) return;
        const tile = $(`#bat-${side}`, col);
        if (!tile) return;
        const valueEl = $(`[data-field="battery-soc"]`, tile);
        const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
        if (valueEl) valueEl.textContent = String(Math.round(clamped));
    }

    function setBatteryState(side, flow) {
        if (!Number.isFinite(flow)) {
                            setTileState(side, "battery", "waiting");
            return;
        }
        if (flow < 0) setTileState(side, "battery", "discharging");
        else if (flow > 0) setTileState(side, "battery", "charging");
        else setTileState(side, "battery", "waiting");
    }

    function setSolarState(side, power) {
        if (!Number.isFinite(power)) {
            setTileState(side, "solar", "waiting");
            return;
        }
        if (power > 0) setTileState(side, "solar", "generating");
        else setTileState(side, "solar", "waiting");
    }

    function setGridPower(side, value) {
        const col = getColBySide(side);
        if (!col) return;
        const tile = $(`#grid-${side}`, col);
        if (!tile) return;
        const valueEl = $(`[data-field="grid-power"]`, tile);
        if (valueEl) valueEl.textContent = formatNumber(value);
    }

    function setTotalPower(value) {
        const el = $("#college-kw");
        if (!el) return;
        el.textContent = `${formatNumber(value)} kW`;
    }

    function setGridState(side, power, status) {
        const normalizedStatus = typeof status === "string" ? status.toLowerCase() : status;
        if (normalizedStatus === 0 || normalizedStatus === "0" || normalizedStatus === "no-grid" || normalizedStatus === "offline") {
            setTileState(side, "grid", "no-grid");
            return;
        }
        if (!Number.isFinite(power)) {
            setTileState(side, "grid", "waiting");
            return;
        }
        if (power < 0) setTileState(side, "grid", "export");
        else if (power > 0) setTileState(side, "grid", "import");
        else setTileState(side, "grid", "waiting");
    }

    function setLineOffline(side) {
        setTileState(side, "solar", "offline");
        setTileState(side, "grid", "offline");
        setTileState(side, "load", "offline");
        setTileState(side, "battery", "offline");
    }

    function setLineOk(side) {
        setTileState(side, "solar", "waiting");
        setTileState(side, "grid", "waiting");
        setTileState(side, "load", "ok");
        setTileState(side, "battery", "waiting");
    }

    const invertersData = new InvertersData();

    window.setTileState = setTileState;
    window.setLineOffline = setLineOffline;
    window.setLineOk = setLineOk;

    // дефолтний стан (можеш змінити на "loading", якщо дані приходять асинхронно)
    function initTileStates() {
        ["left", "right"].forEach(function (side) {
            setTileState(side, "solar", "waiting");
            setTileState(side, "grid", "waiting");
            setTileState(side, "load", "ok");
            setTileState(side, "battery", "waiting");
        });
    }

    function rectRelTo(el, root) {
        const r = el.getBoundingClientRect();
        const p = root.getBoundingClientRect();
        return {
            left: r.left - p.left,
            top: r.top - p.top,
            width: r.width,
            height: r.height,
            right: r.left - p.left + r.width,
            bottom: r.top - p.top + r.height,
            cx: r.left - p.left + r.width / 2,
            cy: r.top - p.top + r.height / 2,
        };
    }

    function setRect(el, x, y, w, h) {
        if (!el) return;
        el.style.left = Math.round(x) + "px";
        el.style.top = Math.round(y) + "px";
        if (w != null) el.style.width = Math.round(w) + "px";
        if (h != null) el.style.height = Math.round(h) + "px";
    }

    function layoutStation(side /* 'left'|'right' */) {
        const col = $(`.block-line-${side === "left" ? "1" : "2"}`);
        if (!col) return;

        const wiring = $(`.wiring-${side}`, col);
        if (!wiring) return;

        const trunk = $(".trunk", wiring);
        const hub = $(".hub", wiring);

        const wSolar = $(".wire-solar", wiring);
        const wMidA = $(".wire-mid-a", wiring);
        const wMidB = $(".wire-mid-b", wiring);
        const wBat = $(".wire-bat", wiring);

        const solar = $(`#solar-${side}`, col);
        const grid = $(`#grid-${side}`, col);
        const load = $(`#load-${side}`, col);
        const bat = $(`#bat-${side}`, col);

        if (!solar || !grid || !load || !bat) return;

        const rSolar = rectRelTo(solar, col);
        const rGrid = rectRelTo(grid, col);
        const rLoad = rectRelTo(load, col);
        const rBat = rectRelTo(bat, col);

        const rowMid = $(".row-mid", col);
        if (!rowMid) return;

        const rMidRow = rectRelTo(rowMid, col);

        // CONFIG (легко підкрутити)
        const padFromTile = 14; // відступ дроту від краю плитки
        const safePad = 24;

        // hub: по центру “порожнього” слота в row-mid
        let trunkX = rMidRow.cx;
        trunkX = Math.max(safePad, Math.min(trunkX, col.clientWidth - safePad));

        // midY: справжній центр між grid та load (візуально)
        const midY = (rGrid.cy + rLoad.cy) / 2;

        // trunk span: гарантовано покрити solar..bat
        const margin = Math.max(80, col.clientHeight * 0.12);
        const tY1 = Math.max(18, Math.min(rSolar.cy, midY, rBat.cy) - margin);
        const tY2 = Math.min(col.clientHeight - 18, Math.max(rSolar.cy, midY, rBat.cy) + margin);

        setRect(trunk, trunkX - 2, tY1, 4, Math.max(10, tY2 - tY1));

        const hubSize = 14;
        setRect(hub, trunkX - hubSize / 2, midY - hubSize / 2, hubSize, hubSize);

        // дріт від точки X(trunk) до плитки по Y
        function wireFromHubY(tileRect, wireEl, y) {
            if (!wireEl) return;

            // визначаємо з якого боку плитка від trunkX
            let x1 = trunkX;
            let x2;

            if (tileRect.cx < trunkX) {
                // плитка ліворуч: йдемо до її правого краю
                x2 = tileRect.right + padFromTile;
            } else {
                // плитка праворуч: йдемо до її лівого краю
                x2 = tileRect.left - padFromTile;
            }

            const w = Math.max(6, Math.abs(x2 - x1));
            const x = Math.min(x1, x2);
            setRect(wireEl, x, y - 2, w, 4);
        }

        // ✅ УСІ дроти стартують від hub (по trunkX) і йдуть до плиток
        wireFromHubY(rSolar, wSolar, rSolar.cy);
        wireFromHubY(rBat, wBat, rBat.cy);

        // mid: обидва на midY (виглядає як хрест з вузлом)
        wireFromHubY(rGrid, wMidA, midY);
        wireFromHubY(rLoad, wMidB, midY);
    }

    let raf = 0;
    function relayoutWires() {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            layoutStation("left");
            layoutStation("right");
            raf = 0;
        });
    }

    window.__relayoutWires = relayoutWires;

    window.addEventListener("load", function () {
        initTileStates();
        relayoutWires();
        loadInverterData();

        setInterval(() => loadInverterData(), 15000);
    });
    window.addEventListener("resize", relayoutWires);
})();

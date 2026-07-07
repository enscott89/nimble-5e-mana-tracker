const MODULE_ID = "nimble-5e-mana-tracker";
const FLAG_KEY = "mana";

const DEFAULT_MANA = {
  enabled: true,
  casterType: "full",
  casterLevel: 1,
  proficiencyBonus: 2,
  spellSlotCount: 2,
  maxMana: 3,
  currentMana: 3
};

const openTrackers = new Map();

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = {
    open: openManaTracker,
    getManaData,
    calculateMaxMana
  };
});

Hooks.on("getSceneControlButtons", controls => {
  const tool = {
    name: "manaTracker",
    title: "Open Mana Tracker",
    icon: "fas fa-magic",
    button: true,
    visible: true,
    onChange: openSelectedTokenManaTracker,
    onClick: openSelectedTokenManaTracker
  };

  if (Array.isArray(controls)) {
    const tokenControls = controls.find(control => control.name === "token" || control.name === "tokens");
    if (!tokenControls?.tools?.some(existing => existing.name === tool.name)) tokenControls?.tools?.push(tool);
    return;
  }

  if (!controls.tokens?.tools) return;

  controls.tokens.tools.manaTracker = {
    ...tool,
    order: Object.keys(controls.tokens.tools).length
  };
});

Hooks.on("renderActorSheet", injectActorSheetButton);
Hooks.on("renderActorSheetV2", injectActorSheetButton);
Hooks.on("renderApplicationV2", injectActorSheetButton);

function injectActorSheetButton(app, html) {
  const actor = app.actor ?? app.document;
  if (actor?.documentName !== "Actor") return;
  if (!actor || !canManageActor(actor)) return;

  const root = getHtmlElement(html);
  const header = root?.querySelector(".window-header, header.window-header");
  if (!header || header.querySelector(`[data-action="${MODULE_ID}.open"]`)) return;

  const button = document.createElement("a");
  button.classList.add("header-button", "mana-tracker-header-button");
  button.dataset.action = `${MODULE_ID}.open`;
  button.innerHTML = `<i class="fas fa-magic"></i> Mana`;
  button.addEventListener("click", event => {
    event.preventDefault();
    openManaTracker(actor);
  });

  const close = header.querySelector(".close");
  header.insertBefore(button, close ?? null);
}

Hooks.on("renderTokenHUD", (app, html) => {
  const actor = app.object?.actor;
  if (!actor || !canManageActor(actor)) return;

  const root = getHtmlElement(html);
  const left = root?.querySelector(".col.left");
  if (!left || left.querySelector(`[data-action="${MODULE_ID}.open"]`)) return;

  const button = document.createElement("div");
  button.classList.add("control-icon", "mana-tracker-token-button");
  button.dataset.action = `${MODULE_ID}.open`;
  button.title = "Open Mana Tracker";
  button.innerHTML = `<i class="fas fa-magic"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    openManaTracker(actor);
  });
  left.appendChild(button);
});

Hooks.on("updateActor", actor => {
  const tracker = openTrackers.get(actor.uuid);
  if (tracker) renderTracker(tracker);
});

async function openManaTracker(actor) {
  if (!actor || !canManageActor(actor)) return;

  const existing = openTrackers.get(actor.uuid);
  if (existing) {
    existing.element.classList.remove("minimized");
    existing.element.focus();
    renderTracker(existing);
    return;
  }

  const element = document.createElement("section");
  element.classList.add("nimble-mana-tracker", "app", "window-app");
  element.tabIndex = -1;

  const tracker = { actor, element };
  openTrackers.set(actor.uuid, tracker);
  document.body.appendChild(element);
  renderTracker(tracker);
}

function openSelectedTokenManaTracker() {
  const token = canvas.tokens?.controlled?.find(candidate => canManageActor(candidate.actor));
  const actor = token?.actor ?? game.user.character;

  if (!actor || !canManageActor(actor)) {
    ui.notifications.warn("Select a token you own, or assign yourself a character, to open the mana tracker.");
    return;
  }

  openManaTracker(actor);
}

function renderTracker(tracker) {
  const { actor, element } = tracker;
  const data = getManaData(actor);
  const max = calculateMaxMana(data);
  const percent = max > 0 ? Math.max(0, Math.min(100, Math.round((data.currentMana / max) * 100))) : 0;
  const setupOpen = tracker.setupOpen ?? true;

  element.innerHTML = `
    <header class="window-header mana-window-header">
      <h4 class="window-title"><i class="fas fa-magic"></i> Mana: ${escapeHtml(actor.name)}</h4>
      <a class="header-button mana-close" data-action="close" title="Close"><i class="fas fa-times"></i></a>
    </header>
    <div class="window-content mana-window-content">
      <div class="mana-meter" aria-label="Mana ${data.currentMana} of ${max}">
        <div class="mana-meter-fill" style="width: ${percent}%"></div>
        <strong>${data.currentMana}</strong><span>/ ${max}</span>
      </div>

      <details class="mana-setup" ${setupOpen ? "open" : ""}>
        <summary>Setup</summary>
        <form class="mana-config">
          <label>
            <span>Caster Type</span>
            <select name="casterType">
              ${option("full", "Full", data.casterType)}
              ${option("half", "Half", data.casterType)}
              ${option("quarter", "Quarter", data.casterType)}
              ${option("custom", "Custom", data.casterType)}
            </select>
          </label>
          <label>
            <span>Caster Level</span>
            <input type="number" name="casterLevel" min="0" step="1" value="${data.casterLevel}">
          </label>
          <label>
            <span>Spell Slots</span>
            <input type="number" name="spellSlotCount" min="0" step="1" value="${data.spellSlotCount}">
          </label>
          <label>
            <span>Proficiency</span>
            <input type="number" name="proficiencyBonus" min="0" step="1" value="${data.proficiencyBonus}">
          </label>
          <label>
            <span>Max Mana</span>
            <input type="number" name="maxMana" min="0" step="1" value="${max}" ${data.casterType === "custom" ? "" : "readonly"}>
          </label>
          <label>
            <span>Current</span>
            <input type="number" name="currentMana" min="0" step="1" value="${data.currentMana}">
          </label>
        </form>
      </details>

      <section class="mana-actions">
        <div class="mana-action-group">
          <h5>Spend Spell Level</h5>
          <div class="mana-level-buttons">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => `<button type="button" data-action="spend" data-amount="${level}" title="Spend ${level} mana">${level}</button>`).join("")}
          </div>
          <div class="mana-inline-action">
            <input type="number" name="customSpend" min="0" step="1" value="1" aria-label="Custom spend amount">
            <button type="button" data-action="spend-custom"><i class="fas fa-minus"></i> Spend</button>
          </div>
        </div>

        <div class="mana-action-group">
          <h5>Recover</h5>
          <div class="mana-inline-action">
            <input type="number" name="customRecover" min="0" step="1" value="1" aria-label="Custom recovery amount">
            <button type="button" data-action="recover-custom"><i class="fas fa-plus"></i> Recover</button>
          </div>
          <div class="mana-recovery-buttons">
            <button type="button" data-action="arcane-recovery">Arcane Recovery</button>
            <button type="button" data-action="long-rest">Long Rest</button>
          </div>
        </div>
      </section>
    </div>
  `;

  element.querySelector("[data-action='close']").addEventListener("click", () => closeTracker(actor));
  element.querySelector(".mana-window-header").addEventListener("pointerdown", event => startDrag(event, element));
  element.querySelector(".mana-setup").addEventListener("toggle", event => {
    tracker.setupOpen = event.currentTarget.open;
  });
  element.querySelector(".mana-config").addEventListener("change", event => saveConfig(actor, event.currentTarget));
  element.querySelectorAll("[data-action='spend']").forEach(button => {
    button.addEventListener("click", () => changeMana(actor, -numberFrom(button.dataset.amount)));
  });
  element.querySelector("[data-action='spend-custom']").addEventListener("click", () => {
    changeMana(actor, -numberFrom(element.querySelector("[name='customSpend']").value));
  });
  element.querySelector("[data-action='recover-custom']").addEventListener("click", () => {
    changeMana(actor, numberFrom(element.querySelector("[name='customRecover']").value));
  });
  element.querySelector("[data-action='arcane-recovery']").addEventListener("click", () => {
    changeMana(actor, Math.ceil(numberFrom(getManaData(actor).casterLevel) / 2));
  });
  element.querySelector("[data-action='long-rest']").addEventListener("click", () => {
    const current = getManaData(actor);
    updateMana(actor, { currentMana: calculateMaxMana(current) });
  });
}

async function saveConfig(actor, form) {
  const previous = getManaData(actor);
  const formData = new FormData(form);
  const next = {
    casterType: String(formData.get("casterType") ?? previous.casterType),
    casterLevel: numberFrom(formData.get("casterLevel")),
    spellSlotCount: numberFrom(formData.get("spellSlotCount")),
    proficiencyBonus: numberFrom(formData.get("proficiencyBonus")),
    maxMana: numberFrom(formData.get("maxMana")),
    currentMana: numberFrom(formData.get("currentMana"))
  };

  const max = calculateMaxMana(next);
  next.currentMana = clamp(next.currentMana, 0, max);
  next.maxMana = max;

  await updateMana(actor, next);
}

async function changeMana(actor, delta) {
  const data = getManaData(actor);
  const max = calculateMaxMana(data);
  await updateMana(actor, { currentMana: clamp(data.currentMana + delta, 0, max), maxMana: max });
}

async function updateMana(actor, changes) {
  const data = { ...getManaData(actor), ...changes };
  data.maxMana = calculateMaxMana(data);
  data.currentMana = clamp(numberFrom(data.currentMana), 0, data.maxMana);
  await actor.setFlag(MODULE_ID, FLAG_KEY, data);
}

function getManaData(actor) {
  const stored = actor.getFlag(MODULE_ID, FLAG_KEY) ?? {};
  const data = { ...DEFAULT_MANA, ...stored };
  data.casterLevel = numberFrom(data.casterLevel);
  data.proficiencyBonus = numberFrom(data.proficiencyBonus);
  data.spellSlotCount = numberFrom(data.spellSlotCount);
  data.maxMana = numberFrom(data.maxMana);
  data.currentMana = numberFrom(data.currentMana);
  data.maxMana = calculateMaxMana(data);
  data.currentMana = clamp(data.currentMana, 0, data.maxMana);
  return data;
}

function calculateMaxMana(data) {
  const casterLevel = numberFrom(data.casterLevel);
  const proficiencyBonus = numberFrom(data.proficiencyBonus);
  const spellSlotCount = numberFrom(data.spellSlotCount);

  switch (data.casterType) {
    case "half":
      return Math.max(0, casterLevel + proficiencyBonus);
    case "quarter":
      return Math.max(0, spellSlotCount + proficiencyBonus);
    case "custom":
      return Math.max(0, numberFrom(data.maxMana));
    case "full":
    default:
      return Math.max(0, casterLevel + spellSlotCount);
  }
}

function closeTracker(actor) {
  const tracker = openTrackers.get(actor.uuid);
  if (!tracker) return;
  tracker.element.remove();
  openTrackers.delete(actor.uuid);
}

function startDrag(event, element) {
  if (event.button !== 0 || event.target.closest("a, button")) return;

  const startX = event.clientX;
  const startY = event.clientY;
  const rect = element.getBoundingClientRect();

  function onMove(moveEvent) {
    const nextLeft = rect.left + moveEvent.clientX - startX;
    const nextTop = rect.top + moveEvent.clientY - startY;
    element.style.left = `${clamp(nextLeft, 0, window.innerWidth - 80)}px`;
    element.style.top = `${clamp(nextTop, 0, window.innerHeight - 40)}px`;
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function canManageActor(actor) {
  return actor?.testUserPermission?.(game.user, "OWNER") ?? game.user.isGM;
}

function getHtmlElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function option(value, label, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

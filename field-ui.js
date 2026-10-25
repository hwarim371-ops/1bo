(() => {
  "use strict";
  const SIZE_KEY = "hwarim-reading-size";
  const LIST_SIZES = [["default", "전체 글자 설정 따름"], ["8", "최소 · 8"], ["9", "한눈에 · 9"], ["10", "한눈에 · 10"], ["11", "한눈에 · 11"], ["12", "한눈에 · 12"], ["13", "한눈에 · 13"], ["14", "아주 작게 · 14"], ["16", "작게 · 16"], ["18", "보통 · 18"], ["20", "크게 · 20"], ["22", "더 크게 · 22"], ["24", "아주 크게 · 24"], ["28", "최대로 · 28"]];
  const PAGE_SIZE = 30;
  const pages = {};
  const expanded = new Set();
  const columns = {
    work: ["날짜", "주공정", "부공정", "작업내용", "장비", "인력", "투입공수", "비용 구분", "금액 (원)", "지급 상태", "비고", "도급 선택", "저장 상태", "관리"],
    material: ["날짜", "공정", "제품", "업체명", "지역", "발주 금액 (원)", "비교 최저가 (원)", "비교 최고가 (원)", "비고", "외상 금액 (원)", "저장 상태", "관리"]
  };
  const primary = { work: [0, 3, 8, 9, 12, 13], material: [0, 2, 3, 5, 9, 10, 11] };
  const paymentLabels = { "외상": "아직 안 줌 (외상)", "결제완료": "지급완료", "카드결제": "지급완료 · 카드", "현장결제": "지급완료 · 현장", "": "선택 안 함" };

  function moneyNote(value) {
    if (value === "" || value == null) return "원 단위로 입력하세요. 예: 30만원 = 300000";
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return "0 이상의 금액을 입력하세요.";
    const formatted = amount.toLocaleString("ko-KR") + "원";
    if (!Number.isSafeInteger(amount) || amount < 10000) return formatted;
    const parts = [Math.floor(amount / 100000000), Math.floor(amount % 100000000 / 10000), amount % 10000];
    const words = parts.map((n, i) => n ? n.toLocaleString("ko-KR") + ["억", "만", ""][i] : "").filter(Boolean).join(" ");
    return `${formatted} (${words} 원)`;
  }

  function updateMoneyHint(input) {
    if (!input) return;
    let hint = input.nextElementSibling;
    if (!hint?.classList.contains("money-hint")) {
      hint = document.createElement("small");
      hint.className = "money-hint";
      hint.id = "money-hint-" + (++updateMoneyHint.sequence);
      input.after(hint);
      const ids = new Set((input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean));
      ids.add(hint.id);
      input.setAttribute("aria-describedby", [...ids].join(" "));
    }
    hint.textContent = moneyNote(input.value) + (input.dataset.auto === "true" && input.value !== "" ? " · 자동 계산" : "");
  }
  updateMoneyHint.sequence = 0;

  function inputError(input, message) {
    saveResult(message, true);
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    let hint = input.parentElement.querySelector(".input-error");
    if (!hint) {
      hint = document.createElement("small");
      hint.className = "input-error";
      hint.setAttribute("role", "alert");
      input.after(hint);
    }
    hint.textContent = message;
    const details = input.closest("details");
    if (details) details.open = true;
    input.focus();
  }

  function saveResult(message, warning = false) {
    const box = document.querySelector("#saveResult");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
    box.classList.toggle("warning", warning);
  }

  function setReadingSize(size, persist = true) {
    const safe = ["normal", "large", "larger"].includes(size) ? size : "normal";
    document.documentElement.dataset.readingSize = safe;
    const select = document.querySelector("#readingSize");
    if (select) select.value = safe;
    if (persist) {
      try { localStorage.setItem(SIZE_KEY, safe); }
      catch { saveResult("글자 크기는 바뀌었지만 이 기기에 설정을 기억하지 못했습니다.", true); }
    }
  }

  function makeDetails(target, title, className) {
    if (!target || target.parentElement.matches("details")) return null;
    const details = document.createElement("details");
    details.className = className;
    const summary = document.createElement("summary");
    summary.textContent = title;
    target.before(details);
    details.append(summary, target);
    return details;
  }

  function setListTextSize(kind, size, persist = true) {
    if (!["work", "material"].includes(kind)) return;
    const safe = LIST_SIZES.some(([value]) => value === size) ? size : "default";
    const view = document.getElementById(kind === "work" ? "view-logs" : "view-materials");
    if (!view) return;
    if (Number(safe) >= 8 && Number(safe) < 14) view.dataset.listCompact = "true";
    else delete view.dataset.listCompact;
    if (safe === "default") {
      view.removeAttribute("data-list-text-size");
      view.style.removeProperty("--list-text-size");
    } else {
      view.dataset.listTextSize = safe;
      view.style.setProperty("--list-text-size", safe + "px");
    }
    const select = document.getElementById(kind + "TextSize");
    if (select) select.value = safe;
    if (persist) {
      try { localStorage.setItem(SIZE_KEY + "-" + kind, safe); }
      catch { saveResult("글자 크기는 바뀌었지만 이 기기에 설정을 기억하지 못했습니다.", true); }
    }
  }

  function setupListTextSize(kind, heading, editButton) {
    const tools = document.createElement("div");
    tools.className = "list-display-tools";
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = (kind === "work" ? "업무" : "자재") + " 보기 글자 크기";
    const select = document.createElement("select");
    select.id = kind + "TextSize";
    LIST_SIZES.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    });
    label.append(caption, select);
    tools.append(label, editButton);
    heading.append(tools);
    let saved;
    try { saved = localStorage.getItem(SIZE_KEY + "-" + kind); } catch {}
    setListTextSize(kind, saved, false);
    select.addEventListener("change", () => setListTextSize(kind, select.value));
  }

  function setupList(kind, viewId, prefix) {
    const view = document.querySelector(viewId);
    const table = view.querySelector("table");
    table.classList.add("field-record-table");
    const filters = document.createElement("div");
    filters.className = "field-filter-grid";
    const inline = view.querySelector(".inline-filters");
    const editButton = inline.querySelector("[id^='toggle']");
    setupListTextSize(kind, view.querySelector(".section-heading"), editButton);
    const filterRow = table.querySelector(".table-filter-row");
    const inputs = [...inline.querySelectorAll("input, select"), ...filterRow.querySelectorAll("input, select")];
    inputs.forEach((input) => {
      const label = document.createElement("label");
      const name = document.createElement("span");
      const col = input.closest("th")?.cellIndex;
      name.textContent = col != null ? columns[kind][col] : (input.getAttribute("aria-label") || input.placeholder || "검색").replace(" 필터", "");
      label.append(name, input);
      filters.append(label);
    });
    filters.append(inline.querySelector("button"));
    inline.remove();
    filterRow.remove();
    view.querySelector(".section-heading").after(filters);
    const details = makeDetails(filters, "기록 찾기 · 검색조건", "field-search");
    const summary = details.querySelector("summary");
    const updateFilterTitle = () => {
      const count = inputs.filter((input) => input.value && input.value !== "전체 공정").length;
      summary.textContent = count ? `검색조건 ${count}개 적용 중 · 전체 보려면 조건 지우기` : "기록 찾기 · 검색조건";
    };
    details.addEventListener("input", updateFilterTitle);
    details.addEventListener("change", updateFilterTitle);
    filters.querySelector("button").addEventListener("click", () => requestAnimationFrame(updateFilterTitle));
    makeDetails(document.querySelector(prefix + "BulkEditBar"), "여러 건 한 번에 수정", "field-advanced");
  }

  function pageRows(rows, kind, filters, render) {
    const page = pages[kind] ||= { index: 0, signature: "", order: "newest" };
    const signature = JSON.stringify(filters);
    if (signature !== page.signature) page.index = 0;
    page.signature = signature;
    const sorted = page.order === "newest" ? rows.slice().reverse() : rows;
    if (page.reveal) {
      const index = sorted.findIndex((row) => row.id === page.reveal);
      if (index >= 0) page.index = Math.floor(index / PAGE_SIZE);
      expanded.add(kind + ":" + page.reveal);
      delete page.reveal;
    }
    const count = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page.index = Math.max(0, Math.min(count - 1, page.index));
    const start = page.index * PAGE_SIZE;
    let pager = document.getElementById(kind + "Pager");
    if (!pager) {
      pager = document.createElement("nav");
      pager.id = kind + "Pager";
      pager.className = "field-pager";
      pager.setAttribute("aria-label", "기록 페이지");
      const view = document.getElementById(kind === "work" ? "view-logs" : "view-materials");
      view.querySelector(".table-wrap").before(pager);
    }
    pager.replaceChildren();
    const info = document.createElement("span");
    info.setAttribute("role", "status");
    info.textContent = `총 ${rows.length}건 · ${rows.length ? start + 1 : 0}~${Math.min(start + PAGE_SIZE, rows.length)}건 (${page.index + 1}/${count}쪽)`;
    pager.append(info);
    for (const [label, step] of [["이전", -1], ["다음", 1]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-btn";
      button.textContent = label;
      button.disabled = step < 0 ? page.index === 0 : page.index === count - 1;
      button.addEventListener("click", () => {
        page.index += step;
        render();
        pager.querySelectorAll("button")[step < 0 ? 0 : 1]?.focus({ preventScroll: true });
      });
      pager.append(button);
    }
    const order = document.createElement("select");
    order.setAttribute("aria-label", "기록 정렬 순서");
    order.innerHTML = '<option value="newest">최근 날짜부터</option><option value="oldest">오래된 날짜부터</option>';
    order.value = page.order;
    order.addEventListener("change", () => { page.order = order.value; page.index = 0; render(); });
    pager.append(order);
    return sorted.slice(start, start + PAGE_SIZE);
  }

  function revealRecord(kind, id) {
    (pages[kind] ||= { index: 0, signature: "", order: "newest" }).reveal = id;
  }

  function enhanceTable(body, kind) {
    body.querySelectorAll("tr[data-record-id]").forEach((row) => {
      const key = kind + ":" + row.dataset.recordId;
      row.classList.toggle("row-expanded", expanded.has(key));
      [...row.cells].forEach((cell, index) => {
        cell.dataset.label = columns[kind][index] || "";
        cell.classList.toggle("card-primary", primary[kind].includes(index));
        cell.classList.toggle("card-heading", index === (kind === "work" ? 3 : 2));
        cell.querySelectorAll("input, select, textarea").forEach((input) => {
          input.setAttribute("aria-label", columns[kind][index] || "입력값");
          if (input.type === "number") input.setAttribute("inputmode", "decimal");
          if (["cost", "orderAmount", "creditAmount", "lowPrice", "highPrice"].includes(input.dataset.field)) input.dataset.money = "";
        });
      });
      const actions = row.cells[row.cells.length - 1];
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "secondary-btn card-toggle";
      const update = () => { toggle.textContent = expanded.has(key) ? "간단히 보기" : "전체 항목 보기"; toggle.setAttribute("aria-expanded", String(expanded.has(key))); };
      toggle.addEventListener("click", () => {
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        row.classList.toggle("row-expanded", expanded.has(key));
        update();
      });
      actions.append(toggle);
      update();
    });
    refresh();
  }

  function refresh() {
    document.querySelectorAll("[data-money]").forEach(updateMoneyHint);
    document.querySelectorAll(".resource-payment").forEach((select) => {
      [...select.options].forEach((option) => { if (option.value in paymentLabels) option.textContent = paymentLabels[option.value]; });
    });
    const sub = document.querySelector("#subProcess");
    if (sub) {
      let selected = document.querySelector("#selectedSubProcess");
      if (!selected) { selected = document.createElement("small"); selected.id = "selectedSubProcess"; selected.className = "selected-process"; sub.after(selected); }
      selected.textContent = sub.options[sub.selectedIndex]?.textContent || "";
    }
  }

  window.FieldUI = { moneyNote, updateMoneyHint, inputError, saveResult, setListTextSize, pageRows, revealRecord, enhanceTable, refresh };
  document.addEventListener("DOMContentLoaded", () => {
    try { setReadingSize(localStorage.getItem(SIZE_KEY), false); } catch { setReadingSize("normal", false); }
    document.querySelector("#readingSize").addEventListener("change", (event) => setReadingSize(event.target.value));
    setupList("work", "#view-logs", "#log");
    setupList("material", "#view-materials", "#material");
    const baseHeight = window.visualViewport?.height || window.innerHeight;
    const keyboard = () => {
      const focused = document.activeElement?.matches("input, textarea, select");
      document.body.classList.toggle("keyboard-open", Boolean(focused && window.visualViewport && baseHeight - window.visualViewport.height > 150));
    };
    window.visualViewport?.addEventListener("resize", keyboard);
    document.addEventListener("focusout", () => requestAnimationFrame(keyboard));
    document.addEventListener("input", (event) => {
      const input = event.target;
      if (input.matches("[data-money]")) updateMoneyHint(input);
      if (input.getAttribute("aria-invalid") === "true") {
        input.removeAttribute("aria-invalid");
        input.parentElement.querySelector(".input-error")?.remove();
      }
    });
    document.querySelector("#subProcess").addEventListener("change", refresh);
    document.querySelector("#mainProcess").addEventListener("change", () => requestAnimationFrame(refresh));
    document.querySelector("#materialForm").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing && !event.target.matches("textarea, button")) event.preventDefault();
    });
    refresh();
  });
})();

// Opto Rank — injects 1–5 ratings + "Momentos o7" into opto.sic.pt (a Nuxt SPA, so everything
// here is idempotent and re-run whenever the DOM or URL changes).
(() => {
  const SCALE = [
    { score: 1, label: "Intancável" },
    { score: 2, label: "Meh" },
    { score: 3, label: "Tancável" },
    { score: 4, label: "Vê-se bem" },
    { score: 5, label: "Cinema" },
  ];
  const MAX_SCORE = SCALE.length;
  const MAX_MOMENTS = 99;
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const ROUTE = new RegExp(`^/(series|movie|vod)/[^/]+/(${UUID})`, "i");
  const END_PROMPT_SECONDS = 120;

  // ---------- data ----------

  const items = new Map(); // Opto item/season fetches, keyed by API path (promises)
  const stats = new Map(); // contentId -> { count, avg, hist, mine, moments, momentsUpdatedAt }

  function opto(path) {
    if (!items.has(path)) {
      const p = fetch(`/api/v1/content/item/${path}`).then((r) => {
        if (!r.ok) throw new Error(`Opto API ${r.status}`);
        return r.json();
      });
      p.catch(() => items.delete(path));
      items.set(path, p);
    }
    return items.get(path);
  }

  async function send(msg) {
    let res;
    try {
      res = await chrome.runtime.sendMessage(msg);
    } catch (err) {
      // After the extension is reloaded/updated, this old copy of the script
      // can no longer reach the background worker until the tab is refreshed.
      if (!chrome.runtime?.id || /context invalidated/i.test(err.message)) {
        throw new Error("A extensão foi atualizada. Recarrega a página para continuar a votar.");
      }
      throw err;
    }
    if (res?.error) throw new Error(res.error);
    return res.value;
  }

  async function loadStats(contentIds, { force = false } = {}) {
    const missing = force ? contentIds : contentIds.filter((id) => !stats.has(id));
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = await send({ type: "stats", contentIds: missing.slice(i, i + 200) });
      for (const [id, s] of Object.entries(chunk)) stats.set(id, s);
    }
  }

  /** input: { score } and/or { moments } (moments: null clears it). */
  async function vote(contentId, input) {
    const s = await send({ type: "vote", contentId, ...input });
    stats.set(contentId, s);
    document.dispatchEvent(new CustomEvent("opto-rank:changed", { detail: { contentId } }));
    return s;
  }

  // ---------- small helpers ----------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children.flat().filter((c) => c != null));
    return node;
  }

  const fmtAvg = (avg) => avg.toFixed(1).replace(".", ",");
  const votesText = (n) => `${n} ${n === 1 ? "voto" : "votos"}`;
  const labelFor = (avg) => SCALE[Math.round(avg) - 1];
  const isReleased = (item) => !item.release_date || item.release_date * 1000 <= Date.now();

  function toast(message) {
    const t = el("div", { class: "or-toast", role: "status" }, message);
    (document.fullscreenElement ?? document.body).append(t);
    setTimeout(() => t.remove(), 3500);
  }

  // Re-rendering a widget while its Momentos o7 box is being typed in would wipe the input.
  const isTypingIn = (node) =>
    !!node?.contains(document.activeElement) && document.activeElement.matches(".or-o7-input");

  // Keep clicks inside our widgets from triggering Opto's card navigation.
  function isolate(node) {
    for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"]) {
      node.addEventListener(type, (e) => e.stopPropagation());
    }
    return node;
  }

  /** Average badge, e.g. "★ 4,2 · 87 votos". */
  function badge(s, { long = false } = {}) {
    if (!s?.count) return el("span", { class: "or-badge or-badge--empty" }, "Sem notas");
    const l = labelFor(s.avg);
    return el(
      "span",
      { class: "or-badge", title: `Média ${fmtAvg(s.avg)} de ${votesText(s.count)}` },
      el("span", { class: "or-badge-star" }, "★"),
      el("strong", {}, fmtAvg(s.avg)),
      long ? ` · ${l.label}` : null,
      el("span", { class: "or-badge-count" }, ` · ${votesText(s.count)}`),
    );
  }

  function timeAgo(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  }

  /** Number input for the shared "Momentos o7" count (one value for everyone); saves on change. */
  function momentsInput(contentId, { released = true } = {}) {
    if (!released) return null;
    const current = stats.get(contentId)?.moments ?? null;
    const updatedAt = stats.get(contentId)?.momentsUpdatedAt;
    const input = el("input", {
      type: "number",
      class: "or-o7-input",
      min: "0",
      max: String(MAX_MOMENTS),
      step: "1",
      inputmode: "numeric",
      placeholder: "–",
      "aria-label": "Momentos o7",
    });
    if (current != null) input.value = String(current);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // don't trigger Opto's keyboard shortcuts
      if (e.key === "Enter") input.blur();
    });
    input.addEventListener("change", async () => {
      const raw = input.value.trim();
      const moments = raw === "" ? null : Number(raw);
      if (moments !== null && (!Number.isInteger(moments) || moments < 0 || moments > MAX_MOMENTS)) {
        toast(`Momentos o7 tem de ser um número entre 0 e ${MAX_MOMENTS}`);
        input.value = current != null ? String(current) : "";
        return;
      }
      if (moments === current) return;
      input.disabled = true;
      try {
        await vote(contentId, { moments });
      } catch (err) {
        toast(err.message);
        input.value = current != null ? String(current) : "";
      } finally {
        input.disabled = false;
      }
    });
    const title =
      "Quantos momentos o7 teve? O número é o mesmo para toda a gente." +
      (updatedAt ? ` Última alteração ${timeAgo(updatedAt)}.` : "");
    return el("label", { class: "or-o7", title }, el("span", {}, "Momentos o7"), input);
  }

  /** Row of 1–5 buttons; highlights this device's vote. */
  function picker(contentId, { released = true, big = false, onVoted } = {}) {
    const mine = stats.get(contentId)?.mine;
    const row = el("div", { class: `or-picker${big ? " or-picker--big" : ""}`, role: "group", "aria-label": "Dar nota" });
    if (!released) {
      row.append(el("span", { class: "or-muted" }, "Ainda não estreou"));
      return row;
    }
    for (const { score, label } of SCALE) {
      const btn = el(
        "button",
        {
          type: "button",
          class: `or-chip${mine === score ? " is-mine" : ""}`,
          title: big ? null : `${score} · ${label}`,
          "aria-pressed": String(mine === score),
          onclick: async (e) => {
            e.preventDefault();
            row.classList.add("is-busy");
            try {
              const s = await vote(contentId, { score });
              for (const chip of row.querySelectorAll(".or-chip")) {
                const on = chip === btn;
                chip.classList.toggle("is-mine", on);
                chip.setAttribute("aria-pressed", String(on));
              }
              onVoted?.(s);
            } catch (err) {
              toast(err.message);
            } finally {
              row.classList.remove("is-busy");
            }
          },
        },
        big ? null : el("span", { class: "or-chip-score" }, String(score)),
        big ? el("span", { class: "or-chip-label" }, label) : null,
      );
      row.append(btn);
    }
    return row;
  }

  // ---------- series page: card badges + season panel ----------

  async function syncSeries(seriesId) {
    const series = await opto(seriesId);
    const seasons = series.seasons ?? [];
    if (!seasons.length) return;
    const activeName = document.querySelector(".swiper-tabs .swiper-slide p.active")?.textContent.trim();
    const season = seasons.find((s) => s.name.trim() === activeName) ?? seasons[0];
    const { item: episodes = [] } = await opto(`${seriesId}/season/${season.id}?size=500`);
    await loadStats(episodes.map((e) => e.id));

    if (currentKey() !== `series:${seriesId}`) return; // navigated away meanwhile
    decorateCards(episodes);
    renderSeasonPanel(series, season, episodes);
  }

  function decorateCards(episodes) {
    const byLabel = new Map(episodes.map((e) => [`${e.episode_number}. ${e.title}`.trim(), e]));
    for (const card of document.querySelectorAll(".mg-card-descriptive")) {
      const titleEl = card.querySelector(".mg-card-descriptive-description > div");
      const ep = byLabel.get(titleEl?.textContent.trim());
      if (!ep) continue;
      const desc = titleEl.parentElement;
      const stamp = `${ep.id}:${JSON.stringify(stats.get(ep.id))}`;
      const existing = desc.querySelector(":scope > .or-card");
      if (existing?.dataset.stamp === stamp || isTypingIn(existing)) continue;
      const released = isReleased(ep);
      const widget = isolate(
        el(
          "div",
          { class: "or-card" },
          badge(stats.get(ep.id)),
          el("div", { class: "or-card-inputs" }, picker(ep.id, { released }), momentsInput(ep.id, { released })),
        ),
      );
      widget.dataset.stamp = stamp;
      existing ? existing.replaceWith(widget) : desc.append(widget);
    }
  }

  function renderSeasonPanel(series, season, episodes) {
    const grid = document.querySelector(".playlist-grid");
    if (!grid) return;
    const rated = episodes
      .map((e) => ({ ep: e, s: stats.get(e.id) }))
      .filter((x) => x.s?.count);
    const stamp = `${season.id}:${episodes.map((e) => JSON.stringify(stats.get(e.id))).join(",")}`;
    const existing = document.getElementById("or-season-panel");
    if (existing?.dataset.stamp === stamp && existing.nextElementSibling === grid) return;

    const total = rated.reduce((n, x) => n + x.s.count, 0);
    const byAvg = [...rated].sort((a, b) => b.s.avg - a.s.avg || b.s.count - a.s.count);
    const top = byAvg.slice(0, 3);
    const flop = byAvg.length > 3 ? byAvg.slice(-3).reverse() : [];

    const rankList = (title, list, tone) =>
      el(
        "div",
        { class: `or-rank or-rank--${tone}` },
        el("h4", {}, title),
        list.length
          ? el(
              "ol",
              {},
              list.map(({ ep, s }) =>
                el(
                  "li",
                  {},
                  el(
                    "a",
                    { href: `/vod/x/${ep.id}` },
                    el("span", { class: "or-rank-score" }, fmtAvg(s.avg)),
                    el(
                      "span",
                      { class: "or-rank-text" },
                      el("span", { class: "or-rank-title" }, `${ep.episode_number}. ${ep.title}`),
                      el("span", { class: "or-rank-meta" }, `${labelFor(s.avg).label} · ${votesText(s.count)}`),
                    ),
                  ),
                ),
              ),
            )
          : el("p", { class: "or-muted" }, tone === "top" ? "Ainda ninguém votou." : "Precisa de mais episódios votados."),
      );

    const panel = el(
      "section",
      { id: "or-season-panel", class: "or-panel", "aria-label": "Ranking da temporada" },
      el(
        "header",
        { class: "or-panel-head" },
        el("h3", {}, "Ranking da temporada"),
        el("span", { class: "or-muted" }, `${votesText(total)} · ${rated.length} de ${episodes.length} episódios votados`),
      ),
      seasonChart(episodes),
      el("div", { class: "or-panel-ranks" }, rankList("Cinemas", top, "top"), rankList("Fillers", flop, "flop")),
    );
    panel.dataset.stamp = stamp;
    // Line the panel up with the cards (the grid has its own inner gutter).
    const firstCard = grid.querySelector(".mg-card-descriptive");
    if (firstCard) {
      const inset = firstCard.getBoundingClientRect().left - grid.getBoundingClientRect().left;
      panel.style.marginInline = `${Math.max(0, inset)}px`;
    }
    existing?.remove();
    grid.before(panel);
  }

  /** Average per episode as a wide strip of bars, direct value labels instead of an axis. */
  function seasonChart(episodes) {
    const NS = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs = {}) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    const W = 1000, H = 132, padT = 16, padB = 20;
    const plotH = H - padT - padB;
    const step = W / Math.max(episodes.length, 1);
    const barW = Math.max(2, Math.min(28, step * 0.62));
    const base = padT + plotH;
    const y = (v) => base - (v / MAX_SCORE) * plotH;
    const showValues = episodes.length <= 30;

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "or-chart-svg", role: "img", "aria-label": "Média por episódio" });
    svg.append(svgEl("line", { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, class: "or-baseline" }));

    const tip = el("div", { class: "or-tip", hidden: "" });
    episodes.forEach((ep, i) => {
      const s = stats.get(ep.id);
      const n = ep.episode_number ?? i + 1;
      const cx = step * i + step / 2;
      const g = svgEl("g", { class: "or-bar" });
      if (s?.count) {
        const top = y(s.avg), r = Math.min(3, barW / 2), x0 = cx - barW / 2, x1 = cx + barW / 2;
        g.append(svgEl("path", {
          d: `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${base} Z`,
          class: "or-bar-fill",
        }));
        if (showValues) {
          const t = svgEl("text", { x: cx, y: top - 5, class: "or-bar-value", "text-anchor": "middle" });
          t.textContent = fmtAvg(s.avg);
          g.append(t);
        }
      } else {
        g.append(svgEl("rect", { x: cx - barW / 2, y: base - 2, width: barW, height: 2, class: "or-bar-empty" }));
      }
      if (showValues || n % 5 === 0) {
        const t = svgEl("text", { x: cx, y: H - 4, class: "or-axis", "text-anchor": "middle" });
        t.textContent = n;
        g.append(t);
      }
      // hit target spans the whole column, bigger than the mark
      const hit = svgEl("rect", { x: cx - step / 2, y: 0, width: step, height: H, class: "or-hit" });
      hit.addEventListener("mouseenter", () => {
        tip.hidden = false;
        const summary = [
          s?.count ? `${fmtAvg(s.avg)} · ${labelFor(s.avg).label} · ${votesText(s.count)}` : "Sem notas",
          s?.moments != null ? `o7 ${s.moments}` : null,
        ];
        tip.replaceChildren(el("strong", {}, `${n}. ${ep.title}`), el("br"), summary.filter(Boolean).join(" · "));
        tip.style.left = `${Math.min(92, Math.max(8, (cx / W) * 100))}%`;
        g.classList.add("is-hover");
      });
      hit.addEventListener("mouseleave", () => {
        tip.hidden = true;
        g.classList.remove("is-hover");
      });
      hit.addEventListener("click", () => (location.href = `/vod/x/${ep.id}`));
      g.append(hit);
      svg.append(g);
    });

    return el("div", { class: "or-chart" }, svg, tip);
  }

  // ---------- movie page ----------

  async function syncMovie(id) {
    const item = await opto(id);
    await loadStats([id]);
    if (currentKey() !== `movie:${id}`) return;
    const buttons = document.querySelector(".details-web .buttons-web");
    if (!buttons) return;
    const stamp = JSON.stringify(stats.get(id));
    const existing = document.getElementById("or-movie");
    if (existing?.dataset.stamp === stamp || isTypingIn(existing)) return;
    const released = isReleased(item);
    const widget = el(
      "div",
      { id: "or-movie", class: "or-movie" },
      badge(stats.get(id), { long: true }),
      picker(id, { released, big: true }),
      momentsInput(id, { released }),
    );
    widget.dataset.stamp = stamp;
    existing ? existing.replaceWith(widget) : buttons.after(widget);
  }

  // ---------- player page: prompt near the end ----------

  const prompted = new Set();

  // Media events don't bubble, but they do reach a capturing listener on document.
  // Listening here (instead of grabbing the <video> once) works no matter when the
  // player mounts, when its metadata loads, or if it swaps the element.
  document.addEventListener("timeupdate", onPlayback, true);
  document.addEventListener("ended", onPlayback, true);

  const isAd = (video) => video.title === "Advertisement" || !!video.closest(".playkit-ads-container");

  function playableDuration(video) {
    if (Number.isFinite(video.duration)) return video.duration;
    const { seekable } = video; // some HLS streams report Infinity
    return seekable.length ? seekable.end(seekable.length - 1) : NaN;
  }

  function onPlayback(e) {
    const video = e.target;
    if (!(video instanceof HTMLVideoElement) || isAd(video)) return;
    const r = route();
    if (r?.kind !== "vod" || prompted.has(r.id) || new URLSearchParams(location.search).has("trailer")) return;
    const duration = playableDuration(video);
    if (!(duration > 300)) return; // skip short clips/trailers
    const left = duration - video.currentTime;
    if (!video.ended && left > Math.min(END_PROMPT_SECONDS, duration * 0.05)) return;
    prompted.add(r.id);
    openEndPrompt(r.id);
  }

  async function openEndPrompt(id) {
    try {
      const [item] = await Promise.all([opto(id), loadStats([id])]);
      if (currentKey() === `vod:${id}`) showEndPrompt(id, item);
    } catch (err) {
      prompted.delete(id); // try again on the next timeupdate
      console.warn("[Opto Rank]", err);
    }
  }

  function showEndPrompt(id, item) {
    const title = item.type === "episode" ? `${item.episode_number}. ${item.title}` : item.title;
    let summary = badge(stats.get(id));
    const close = () => {
      box.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
    // Capture phase, so it runs before isolate() stops propagation inside the box.
    const onOutside = (e) => {
      if (!box.isConnected) return close();
      if (!box.contains(e.target)) close();
    };
    const onEscape = (e) => {
      if (e.key === "Escape" && box.isConnected) close();
    };
    const box = isolate(
      el(
        "aside",
        { class: "or-end", role: "dialog", "aria-label": `Nota para ${title}`, "data-content-id": id },
        el(
          "header",
          { class: "or-end-head" },
          el("p", { class: "or-end-title" }, title),
          el("button", { type: "button", class: "or-end-close", "aria-label": "Fechar", onclick: close }, "✕"),
        ),
        picker(id, {
          big: true,
          onVoted: (s) => {
            const next = badge(s);
            summary.replaceWith(next);
            summary = next;
          },
        }),
        el("footer", { class: "or-end-foot" }, summary, momentsInput(id)),
      ),
    );
    const mount = () => (document.fullscreenElement ?? document.body).append(box);
    mount();
    document.addEventListener("fullscreenchange", () => box.isConnected && mount());
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
  }

  // ---------- router ----------

  function route() {
    const m = location.pathname.match(ROUTE);
    return m ? { kind: m[1], id: m[2].toLowerCase() } : null;
  }

  function currentKey() {
    const r = route();
    return r ? `${r.kind}:${r.id}` : null;
  }

  let running = false;
  let again = false;
  async function sync() {
    if (running) return void (again = true);
    running = true;
    try {
      // The end-of-episode prompt only belongs on its own player page.
      for (const box of document.querySelectorAll(".or-end")) {
        if (currentKey() !== `vod:${box.dataset.contentId}`) box.remove();
      }
      const r = route();
      if (r?.kind === "series") await syncSeries(r.id);
      else if (r?.kind === "movie") await syncMovie(r.id);
    } catch (err) {
      console.warn("[Opto Rank]", err);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  let timer;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 250);
  }

  new MutationObserver((records) => {
    // Ignore mutations caused only by our own widgets.
    const ours = (n) => n.nodeType === 1 && (n.closest?.("[class^='or-'], #or-season-panel, #or-movie") || n.matches?.("[class^='or-']"));
    if (records.every((r) => ours(r.target) || [...r.addedNodes, ...r.removedNodes].every(ours))) return;
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("opto-rank:changed", schedule);
  window.addEventListener("popstate", schedule);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    await loadStats([...stats.keys()], { force: true }).catch(() => {});
    schedule();
  });

  schedule();
})();

/* Shared ECharts theme + builders. Requires echarts loaded globally. */
(function () {
  const instances = new Set();

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // ECharts canvas cannot parse oklch / color-mix — resolve any CSS color to rgb().
  function resolveColor(input) {
    if (!input) return 'rgb(128,128,128)';
    if (/^#([0-9a-f]{3,8})$/i.test(input)) return input;
    if (/^rgba?\(/i.test(input)) return input;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;color:' + input;
    document.documentElement.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : input;
  }

  function parseRgb(str) {
    const m = String(str).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }

  function lerpRgb(a, b, t) {
    const [r1, g1, b1] = parseRgb(a);
    const [r2, g2, b2] = parseRgb(b);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const bl = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function spendColorRamp(steps = 6) {
    const p = palette();
    const low = resolveColor(cssVar('--color-base-200', '#e8edf4'));
    const high = resolveColor(p.expense);
    const ramp = [];
    for (let i = 0; i < steps; i++) {
      ramp.push(lerpRgb(low, high, i / Math.max(1, steps - 1)));
    }
    return ramp;
  }

  function colorAtRatio(ratio, ramp) {
    const t = Math.max(0, Math.min(1, ratio));
    const pos = t * (ramp.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(ramp.length - 1, lo + 1);
    return lerpRgb(ramp[lo], ramp[hi], pos - lo);
  }

  function palette() {
    const ramp = [];
    for (let i = 1; i <= 6; i++) ramp.push(cssVar(`--cat-${i}`, '#3B82F6'));
    return {
      primary: cssVar('--color-primary', '#2563EB'),
      income: cssVar('--cat-2', '#10B981'),
      expense: cssVar('--cat-1', '#EF4444'),
      text: cssVar('--color-base-content', '#1f2937'),
      grid: `color-mix(in oklch, ${cssVar('--color-base-content', '#000')} 8%, transparent)`,
      ramp,
    };
  }

  // Bar/slice emphasis: keep subtle; avoid scale + focus dimming.
  function barInteraction(color) {
    const style = color ? { itemStyle: { color } } : {};
    return {
      ...style,
      emphasis: { focus: 'none', scale: false, ...style },
      blur: { itemStyle: { opacity: 0.75 } },
      select: { disabled: true },
    };
  }

  // Line emphasis: axis tooltips re-style lines on hover (often dropping color /
  // area fill so the stroke vanishes). Disable series emphasis; tooltip still works.
  function lineInteraction(color, opts = {}) {
    const width = opts.lineWidth ?? 3;
    const areaOpacity = opts.areaOpacity;
    const areaStyle = areaOpacity != null ? { color, opacity: areaOpacity } : opts.areaStyle;
    const showSymbol = opts.showSymbol ?? false;
    return {
      showSymbol,
      symbolSize: opts.symbolSize ?? 6,
      lineStyle: { color, width },
      itemStyle: { color },
      areaStyle,
      emphasis: { disabled: true },
      select: { disabled: true },
    };
  }

  // @deprecated alias — use barInteraction for bars, lineInteraction for lines
  function seriesInteraction(color) {
    return barInteraction(color);
  }

  function baseOptions() {
    const p = palette();
    return {
      textStyle: { fontFamily: 'Poppins, system-ui, sans-serif', color: p.text },
      grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
      // Avoid switching to a separate hover canvas layer (can flicker on HiDPI).
      hoverLayerThreshold: Infinity,
      stateAnimation: { duration: 0 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        // Render the tooltip in <body>, not inside the chart container. Keeping it
        // inside the observed element lets hover-time DOM mutations kick the
        // ResizeObserver into a resize feedback loop (visible blink / bars vanishing),
        // especially on HiDPI displays. appendToBody + confine removes that path.
        appendToBody: true,
        confine: true,
        transitionDuration: 0,
        backgroundColor: 'rgba(20,20,25,0.92)',
        borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v) => '€' + Number(v).toLocaleString('en-IE', { maximumFractionDigits: 0 }),
      },
      legend: { top: 0, textStyle: { color: p.text } },
    };
  }

  function axisFor(labels) {
    const p = palette();
    return {
      xAxis: { type: 'category', data: labels, axisLine: { show: false },
        axisTick: { show: false }, axisLabel: { color: p.text } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: p.grid } },
        axisLabel: { color: p.text, formatter: (v) => '€' + v } },
    };
  }

  function init(el) {
    if (!el) return null;
    el.classList.add('fin-chart-host');

    // Guard against a second ECharts instance on the same element (double-init
    // overlays two canvases that fight on hover). Dispose any prior one first.
    const existing = echarts.getInstanceByDom(el);
    if (existing) existing.dispose();

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    instances.add(chart);

    // Resize ONLY when the container's integer CSS size actually changes, and
    // defer to the next animation frame. This breaks the ResizeObserver ->
    // chart.resize() -> sub-pixel size nudge -> ResizeObserver feedback loop
    // that causes blinking/flicker (notably on devicePixelRatio > 1).
    let rafId = 0;
    let lastW = el.clientWidth;
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
          lastW = w;
          lastH = h;
          chart.resize();
        }
      });
    });
    ro.observe(el);

    // Ensure the observer is torn down when the chart is disposed, so repeated
    // re-renders (range toggles, date changes) don't leak/stack observers.
    const originalDispose = chart.dispose.bind(chart);
    chart.dispose = function () {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      instances.delete(chart);
      return originalDispose();
    };

    return chart;
  }

  function bar(el, { labels, series }) {
    const p = palette();
    const chart = init(el);
    chart.setOption({ ...baseOptions(), ...axisFor(labels),
      series: series.map((s, i) => {
        const color = s.color || p.ramp[i % p.ramp.length];
        return {
          name: s.name, type: 'bar', data: s.data,
          itemStyle: { color, borderRadius: [6, 6, 0, 0] },
          barMaxWidth: 40,
          ...barInteraction(color),
        };
      }) });
    return chart;
  }

  function line(el, { labels, series, area }) {
    const p = palette();
    const chart = init(el);
    chart.setOption({ ...baseOptions(), ...axisFor(labels),
      series: series.map((s, i) => {
        const color = s.color || p.ramp[i % p.ramp.length];
        return {
          name: s.name, type: 'line', smooth: true, data: s.data,
          ...lineInteraction(color, { areaOpacity: area ? 0.12 : undefined }),
        };
      }) });
    return chart;
  }

  function donut(el, { labels, data }) {
    const p = palette();
    const chart = init(el);
    chart.setOption({ ...baseOptions(), tooltip: { trigger: 'item',
        appendToBody: true, confine: true, transitionDuration: 0,
        backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v) => '€' + Number(v).toLocaleString('en-IE') },
      series: [{ type: 'pie', radius: ['55%', '78%'], avoidLabelOverlap: true,
        itemStyle: { borderColor: cssVar('--color-base-100', '#fff'), borderWidth: 2 },
        label: { show: false },
        emphasis: { focus: 'none', scale: false, label: { show: true, formatter: '{b}\n{d}%' } },
        blur: { itemStyle: { opacity: 0.75 } },
        select: { disabled: true },
        data: labels.map((n, i) => {
          const color = p.ramp[i % p.ramp.length];
          return { name: n, value: data[i],
            itemStyle: { color },
            emphasis: { itemStyle: { color } } };
        }) }] });
    return chart;
  }

  // Horizontal bar chart for category totals sorted descending. Pass items
  // already sorted by amount desc; internally reversed for ECharts' bottom-up
  // category axis, so callers/onClick always deal with the natural order.
  function rankedBar(el, { categories, labelTopN = 6, valueFormatter, onClick }) {
    const p = palette();
    const chart = init(el);
    const fmt = valueFormatter || ((v) => '€' + Number(v).toLocaleString('en-IE', { maximumFractionDigits: 0 }));
    const ranked = (categories || []).slice().reverse();
    const n = ranked.length;

    chart.setOption({
      ...baseOptions(),
      tooltip: {
        trigger: 'item', appendToBody: true, confine: true, transitionDuration: 0,
        backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: fmt,
      },
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value', axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: p.grid } },
        axisLabel: { color: p.text, formatter: (v) => '€' + v },
      },
      yAxis: {
        type: 'category', data: ranked.map((c) => c.name),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: p.text },
      },
      series: [{
        type: 'bar', barMaxWidth: 22,
        data: ranked.map((c, revIdx) => {
          const rank = n - 1 - revIdx; // 0 = largest, matches caller's sort order
          const color = c.color || p.ramp[rank % p.ramp.length];
          const showLabel = rank < labelTopN;
          const interaction = barInteraction(color);
          return {
            value: c.amount,
            itemStyle: { color, borderRadius: [0, 6, 6, 0] },
            label: {
              show: showLabel, position: 'right', color: p.text,
              fontSize: 11, formatter: () => fmt(c.amount),
            },
            ...interaction,
            emphasis: {
              ...interaction.emphasis,
              label: { show: true, position: 'right', color: p.text, fontSize: 11, formatter: () => fmt(c.amount) },
            },
          };
        }),
      }],
    });

    if (typeof onClick === 'function') {
      chart.on('click', (evt) => {
        const item = ranked[evt.dataIndex];
        if (item) onClick(item);
      });
    }

    return chart;
  }

  function combo(el, { labels, bars, line: lineSeries }) {
    const p = palette();
    const chart = init(el);
    const lineColor = lineSeries.color || p.primary;
    chart.setOption({ ...baseOptions(),
      xAxis: { type: 'category', data: labels, axisTick: { show: false },
        axisLine: { show: false }, axisLabel: { color: p.text } },
      yAxis: [
        { type: 'value', axisLabel: { formatter: (v) => '€' + v, color: p.text },
          splitLine: { lineStyle: { color: p.grid } } },
        { type: 'value', axisLabel: { formatter: (v) => '€' + v, color: p.text },
          splitLine: { show: false }, position: 'right' },
      ],
      series: [
        ...bars.map((b) => ({
          name: b.name, type: 'bar', data: b.data,
          itemStyle: { color: b.color, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
          ...barInteraction(b.color),
        })),
        { name: lineSeries.name, type: 'line', yAxisIndex: 1, smooth: true,
          data: lineSeries.data,
          ...lineInteraction(lineColor, { areaOpacity: 0.08 }) },
      ] });
    return chart;
  }

  function weekdaySpend(el, { xLabels, data }) {
    const p = palette();
    const chart = init(el);
    const max = Math.max(...data, 1);
    const ramp = spendColorRamp(6);
    const textColor = resolveColor(p.text);
    const amounts = data.map((v) => Math.round(v * 100) / 100);

    chart.setOption({
      ...baseOptions(),
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        confine: true,
        transitionDuration: 0,
        backgroundColor: 'rgba(20,20,25,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        axisPointer: { type: 'shadow', triggerEmphasis: false },
        valueFormatter: (v) => '€' + Number(v).toLocaleString('en-IE', { maximumFractionDigits: 0 }),
      },
      grid: { left: 4, right: 4, top: 28, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 12,
          fontWeight: 500,
          margin: 10,
          fontFamily: 'Poppins, system-ui, sans-serif',
        },
      },
      yAxis: {
        type: 'value',
        show: false,
        max: max * 1.2,
      },
      series: [{
        name: 'Spend',
        type: 'bar',
        data: amounts.map((val, i) => {
          const fill = colorAtRatio(val / max, ramp);
          return {
            value: val,
            itemStyle: {
              color: fill,
              borderRadius: [8, 8, 4, 4],
            },
            label: {
              show: val > 0,
              position: 'top',
              distance: 4,
              color: textColor,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'Poppins, system-ui, sans-serif',
              formatter: () => '€' + Number(val).toLocaleString('en-IE', { maximumFractionDigits: 0 }),
            },
          };
        }),
        barMaxWidth: 52,
        ...barInteraction(),
      }],
    });
    return chart;
  }

  // Back-compat alias — heatmap could not render CSS color-mix/oklch stops.
  function heatmap(el, opts) {
    return weekdaySpend(el, opts);
  }

  function disposeAll() { instances.forEach((c) => c.dispose()); instances.clear(); }

  window.FinCharts = { init, palette, baseOptions, bar, line, donut, rankedBar, combo, heatmap, weekdaySpend, disposeAll, barInteraction, lineInteraction, seriesInteraction };
})();

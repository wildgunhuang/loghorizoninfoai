function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const target = href.endsWith(".md")
      ? `reader.html?file=${encodeURIComponent(href)}`
      : href;
    return `<a href="${target}">${escapeHtml(label)}</a>`;
  });
  return html;
}

function renderMetaBlock(items) {
  const entries = items
    .map((item) => item.match(/^([^：:]+)[：:]\s*(.+)$/))
    .filter(Boolean);

  if (!entries.length || entries.length !== items.length) {
    return "";
  }

  const cards = entries
    .map(
      ([, label, value]) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(label.trim())}</span>
          <span class="meta-value">${renderInline(value.trim())}</span>
        </div>`
    )
    .join("");

  return `<section class="meta">${cards}</section>`;
}

function extractLeadingMeta(lines) {
  let index = 0;
  while (index < lines.length && !lines[index].trim()) {
    index += 1;
  }

  if (index >= lines.length || !/^#\s+/.test(lines[index])) {
    return null;
  }

  let start = index + 1;
  while (start < lines.length && !lines[start].trim()) {
    start += 1;
  }

  const items = [];
  let end = start;

  while (end < lines.length) {
    const match = lines[end].match(/^- (.+)$/);
    if (!match) {
      break;
    }
    items.push(match[1]);
    end += 1;
  }

  if (!items.length) {
    return null;
  }

  const html = renderMetaBlock(items);
  if (!html) {
    return null;
  }

  return { start, end: end - 1, html };
}

function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let inList = false;
  let inCode = false;
  let paragraph = [];
  const leadingMeta = extractLeadingMeta(lines);

  const flushParagraph = () => {
    if (!paragraph.length) return;
    parts.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    parts.push("</ul>");
    inList = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (leadingMeta && index === leadingMeta.start) {
      flushParagraph();
      closeList();
      parts.push(leadingMeta.html);
      index = leadingMeta.end;
      continue;
    }

    const line = lines[index];

    if (line.startsWith("```")) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        parts.push("<pre><code>");
      } else {
        inCode = false;
        parts.push("</code></pre>");
      }
      continue;
    }

    if (inCode) {
      parts.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const list = line.match(/^- (.*)$/);
    if (list) {
      flushParagraph();
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${renderInline(list[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  return parts.join("");
}

async function loadMarkdown(file) {
  const candidates = [
    file,
    file.normalize("NFC"),
    file.normalize("NFD"),
  ].filter((value, index, array) => array.indexOf(value) === index);

  for (const candidate of candidates) {
    const response = await fetch(candidate);
    if (response.ok) {
      return response.text();
    }
  }

  throw new Error(`Failed to load ${file}`);
}

function titleFromMarkdown(markdown, fallback) {
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  return firstHeading ? firstHeading[1].trim() : fallback;
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const file = params.get("file") || "词条索引.md";
  const content = document.getElementById("content");
  const title = document.getElementById("page-title");
  const subtitle = document.getElementById("page-subtitle");
  const rawLink = document.getElementById("raw-link");

  if (rawLink) {
    rawLink.href = file;
  }

  try {
    const markdown = await loadMarkdown(file);
    document.body.dataset.view = file === "词条索引.md" ? "index" : "entry";
    title.textContent = titleFromMarkdown(markdown, "设定词条");
    subtitle.textContent = file;
    content.innerHTML = parseMarkdown(markdown);
    document.title = title.textContent;
  } catch (error) {
    document.body.dataset.view = "error";
    title.textContent = "读取失败";
    subtitle.textContent = file;
    content.innerHTML = `<p>无法读取词条文件：<code>${escapeHtml(file)}</code></p>`;
  }
}

main();

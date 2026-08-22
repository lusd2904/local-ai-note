function applyMarks(text, marks = []) {
  let t = text;
  marks.forEach((m) => {
    if (m.type === 'bold') t = `**${t}**`;
    else if (m.type === 'italic') t = `*${t}*`;
    else if (m.type === 'strike') t = `~~${t}~~`;
    else if (m.type === 'code') t = `\`${t}\``;
    else if (m.type === 'underline') t = `<u>${t}</u>`;
  });
  return t;
}

function walk(node, listIndex = 0) {
  if (!node) return '';
  if (node.type === 'text') return applyMarks(node.text || '', node.marks);
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'image') {
    const src = node.attrs?.src || '';
    const alt = node.attrs?.alt || '';
    return `![${alt}](${src})`;
  }
  if (node.type === 'horizontalRule') return '---';

  const children = node.content || [];
  const inner = children.map((child, i) => walk(child, i)).join('');

  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(node.attrs?.level || 1)} ${inner}`;
    case 'paragraph':
      return inner;
    case 'blockquote':
      return inner.split('\n').map((line) => `> ${line}`).join('\n');
    case 'codeBlock':
      return `\`\`\`\n${inner}\n\`\`\``;
    case 'bulletList':
      return children.map((child) => walk(child)).join('\n');
    case 'orderedList':
      return children.map((child, i) => walk(child, i)).join('\n');
    case 'listItem': {
      const prefix = listIndex >= 0 ? `- ` : '- ';
      return `${prefix}${inner.replace(/\n/g, '\n  ')}`;
    }
    case 'table':
      return children.map((row) => walk(row)).join('\n');
    case 'tableRow':
      return `| ${children.map((cell) => walk(cell).replace(/\n/g, ' ')).join(' | ')} |`;
    case 'tableHeader':
    case 'tableCell':
      return inner;
    case 'doc':
      return children.map((child) => walk(child)).join('\n\n');
    default:
      return inner;
  }
}

export function tiptapJsonToMarkdown(doc) {
  if (!doc) return '';
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch {
      return doc;
    }
  }
  return walk(doc).trim();
}

export function makeSummary(markdown, limit = 150) {
  if (!markdown) return '';
  return markdown.replace(/[#*`>_\-\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

export function isBlockNoteDocument(parsed) {
  return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.type === 'string' && parsed[0]?.id;
}

export function isTiptapDocument(parsed) {
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.type === 'doc';
}

export function noteJsonToMarkdown(contentJson, fallback = '') {
  if (!contentJson) return fallback || '';
  let parsed = contentJson;
  if (typeof contentJson === 'string') {
    try {
      parsed = JSON.parse(contentJson);
    } catch {
      return contentJson || fallback || '';
    }
  }
  if (isTiptapDocument(parsed)) {
    return tiptapJsonToMarkdown(parsed) || fallback || '';
  }
  return fallback || '';
}

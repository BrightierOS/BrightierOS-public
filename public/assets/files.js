const breadcrumbEl = document.getElementById('breadcrumb');
const tableBodyEl = document.querySelector('#filesTable tbody');
const tableEl = document.getElementById('filesTable');
const backButton = document.getElementById('backButton');
const newFolderButton = document.getElementById('newFolderButton');
const newFileButton = document.getElementById('newFileButton');
const uploadButton = document.getElementById('uploadButton');
const uploadFolderButton = document.getElementById('uploadFolderButton');
const uploadInput = document.getElementById('uploadInput');
const uploadFolderInput = document.getElementById('uploadFolderInput');

const state = {
  currentPath: ''
};

let previewPanel = null;

function joinPaths(...parts) {
  return parts
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
    .join('/');
}

function getParentPath(path) {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function getItemPath(itemName) {
  return joinPaths(state.currentPath, itemName);
}

function formatSize(size) {
  if (size === null || size === undefined) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensurePreviewPanel() {
  if (previewPanel) return previewPanel;

  previewPanel = document.createElement('div');
  previewPanel.id = 'previewPanel';
  previewPanel.style.marginTop = '18px';
  previewPanel.style.padding = '20px';
  previewPanel.style.borderRadius = '14px';
  previewPanel.style.background = '#181818';
  previewPanel.style.border = '1px solid #2b2b2b';
  previewPanel.style.display = 'none';

  const parent = document.querySelector('content');
  if (parent) {
    parent.appendChild(previewPanel);
  }

  return previewPanel;
}

function updateBreadcrumb() {
  const segments = state.currentPath.split('/').filter(Boolean);
  const items = [{ label: 'Home', path: '' }];

  segments.forEach((segment, index) => {
    const path = segments.slice(0, index + 1).join('/');
    items.push({ label: segment, path });
  });

  breadcrumbEl.innerHTML = '';
  items.forEach((item, index) => {
    const span = document.createElement('span');
    span.textContent = item.label;
    span.style.cursor = 'pointer';
    span.style.color = index === items.length - 1 ? '#00d4ff' : '#ffffff';
    span.style.marginRight = '8px';
    span.addEventListener('click', () => {
      state.currentPath = item.path;
      loadFiles();
    });
    breadcrumbEl.appendChild(span);

    if (index < items.length - 1) {
      const sep = document.createElement('span');
      sep.textContent = '›';
      sep.style.marginRight = '8px';
      sep.style.color = '#8a8a8a';
      breadcrumbEl.appendChild(sep);
    }
  });
}

function renderTable(items) {
  tableBodyEl.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'This folder is empty.';
    cell.style.color = '#8a8a8a';
    cell.style.padding = '18px 0';
    row.appendChild(cell);
    tableBodyEl.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';

    const nameCell = document.createElement('td');
    nameCell.textContent = item.name;
    nameCell.style.padding = '10px 0';
    nameCell.addEventListener('click', () => {
      if (item.type === 'folder') {
        state.currentPath = getItemPath(item.name);
        loadFiles();
      } else {
        previewItem(item);
      }
    });

    const typeCell = document.createElement('td');
    typeCell.textContent = item.type === 'folder' ? 'Folder' : 'File';
    typeCell.style.color = item.type === 'folder' ? '#00d4ff' : '#bdbdbd';

    const sizeCell = document.createElement('td');
    sizeCell.textContent = formatSize(item.size);

    const actionsCell = document.createElement('td');
    actionsCell.style.whiteSpace = 'nowrap';

    const openButton = document.createElement('button');
    openButton.textContent = item.type === 'folder' ? 'Open' : 'Preview';
    openButton.style.marginRight = '6px';
    openButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (item.type === 'folder') {
        state.currentPath = getItemPath(item.name);
        loadFiles();
      } else {
        previewItem(item);
      }
    });

    const renameButton = document.createElement('button');
    renameButton.textContent = 'Rename';
    renameButton.style.marginRight = '6px';
    renameButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const newName = prompt('New name:', item.name);
      if (!newName || newName === item.name) return;
      const oldPath = getItemPath(item.name);
      const newPath = joinPaths(state.currentPath, newName);
      await requestJson('/api/files/rename', {
        oldPath,
        newPath
      });
      await loadFiles();
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.style.marginRight = '6px';
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const confirmed = confirm(`Delete ${item.name}?`);
      if (!confirmed) return;
      await requestJson('/api/files/delete', {
        path: getItemPath(item.name)
      });
      await loadFiles();
    });

    if (item.type !== 'folder') {
      const downloadButton = document.createElement('button');
      downloadButton.textContent = 'Download';
      downloadButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const filePath = getItemPath(item.name);
        window.location.href = `/api/files/download?path=${encodeURIComponent(filePath)}`;
      });
      actionsCell.appendChild(downloadButton);
    }

    actionsCell.prepend(deleteButton, renameButton, openButton);

    row.append(nameCell, typeCell, sizeCell, actionsCell);
    tableBodyEl.appendChild(row);
  });
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed.');
  }

  return response.json().catch(() => ({}));
}

async function loadFiles() {
  try {
    const params = new URLSearchParams();
    if (state.currentPath) {
      params.set('path', state.currentPath);
    }

    const response = await fetch(`/api/files/list?${params.toString()}`);
    const items = await response.json();

    renderTable(items);
    updateBreadcrumb();
    hidePreview();
  } catch (error) {
    console.error(error);
    alert('Unable to load files.');
  }
}

async function createFolder() {
  const folderName = prompt('Folder name:');
  if (!folderName) return;

  try {
    await requestJson('/api/files/create-folder', {
      path: joinPaths(state.currentPath, folderName)
    });
    await loadFiles();
  } catch (error) {
    alert(error.message);
  }
}

async function createFile() {
  const fileName = prompt('File name:');
  if (!fileName) return;

  try {
    await requestJson('/api/files/create-file', {
      path: joinPaths(state.currentPath, fileName)
    });
    await loadFiles();
  } catch (error) {
    alert(error.message);
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', state.currentPath);

  try {
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed.');
    }

    await loadFiles();
  } catch (error) {
    alert(error.message);
  }
}

async function uploadFolder(files) {
  const entries = [];

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const normalized = relativePath.replace(/^\//, '').split('/').filter(Boolean);
    const relativeDir = normalized.slice(0, -1).join('/');
    const fileName = normalized[normalized.length - 1];
    const absolutePath = joinPaths(state.currentPath, relativeDir, fileName);

    if (file.size === 0 && file.type === '') {
      entries.push({ type: 'directory', path: joinPaths(state.currentPath, relativeDir) });
      continue;
    }

    const text = await file.text();
    entries.push({ type: 'file', path: absolutePath, content: text });
  }

  try {
    const response = await fetch('/api/files/upload-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.currentPath, files: entries })
    });

    if (!response.ok) {
      throw new Error('Folder upload failed.');
    }

    await loadFiles();
  } catch (error) {
    alert(error.message);
  }
}

async function previewItem(item) {
  const itemPath = getItemPath(item.name);
  const extension = item.name.split('.').pop()?.toLowerCase() || '';
  const preview = ensurePreviewPanel();
  preview.style.display = 'block';
  preview.innerHTML = '<p>Loading preview...</p>';

  if (item.type === 'folder') {
    state.currentPath = itemPath;
    await loadFiles();
    return;
  }

  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  const textExtensions = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv'];

  try {
    if (imageExtensions.includes(extension)) {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(itemPath)}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      preview.innerHTML = `<img src="${url}" alt="${escapeHtml(item.name)}" style="max-width:100%;max-height:300px;border-radius:10px;">`;
      return;
    }

    if (textExtensions.includes(extension)) {
      const response = await fetch(`/api/files/read?path=${encodeURIComponent(itemPath)}`);
      const text = await response.text();
      preview.innerHTML = `
        <h3>${escapeHtml(item.name)}</h3>
        <textarea id="editor" style="width:100%;min-height:240px;border-radius:10px;padding:12px;background:#0f0f0f;color:white;border:1px solid #2e2e2e;">${escapeHtml(text)}</textarea>
        <div style="margin-top:10px;">
          <button id="saveButton">Save</button>
        </div>
      `;

      const saveButton = document.getElementById('saveButton');
      saveButton.addEventListener('click', async () => {
        const editor = document.getElementById('editor');
        try {
          await fetch('/api/files/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: itemPath, content: editor.value })
          });
          await loadFiles();
          preview.innerHTML = '<p>Saved.</p>';
        } catch (error) {
          alert('Unable to save file.');
        }
      });
      return;
    }

    preview.innerHTML = `<p>This file cannot be previewed inline. Use download instead.</p>`;
  } catch (error) {
    preview.innerHTML = '<p>Unable to preview this file.</p>';
  }
}

function hidePreview() {
  if (previewPanel) {
    previewPanel.style.display = 'none';
    previewPanel.innerHTML = '';
  }
}

backButton.addEventListener('click', () => {
  const parentPath = getParentPath(state.currentPath);
  state.currentPath = parentPath;
  loadFiles();
});

newFolderButton.addEventListener('click', createFolder);
newFileButton.addEventListener('click', createFile);
uploadButton.addEventListener('click', () => uploadInput.click());
uploadFolderButton.addEventListener('click', () => uploadFolderInput.click());
uploadInput.addEventListener('change', async () => {
  const [file] = uploadInput.files || [];
  if (!file) return;
  await uploadFile(file);
  uploadInput.value = '';
});
uploadFolderInput.addEventListener('change', async () => {
  const files = Array.from(uploadFolderInput.files || []);
  if (!files.length) return;
  await uploadFolder(files);
  uploadFolderInput.value = '';
});

tableEl.addEventListener('click', (event) => {
  const row = event.target.closest('tr');
  if (!row || !row.parentElement || row.parentElement.tagName !== 'TBODY') return;
});

window.addEventListener('DOMContentLoaded', loadFiles);

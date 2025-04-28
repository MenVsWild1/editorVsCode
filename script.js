document.addEventListener('DOMContentLoaded', () => {
    const fileTreeElement = document.getElementById('fileTree');
    const createFileBtn = document.getElementById('createFileBtn');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const runButton = document.getElementById('runButton');
    const consoleOutputElement = document.getElementById('consoleOutput');
    const clearConsoleBtn = document.getElementById('clearConsoleBtn');
    const editorElement = document.getElementById('editor');
    const runPythonBtn = document.getElementById('runPythonBtn');
    const saveButton = document.getElementById('saveButton');

    let fileSystem;
    let activeFileId;
    let editor;
    let draggedElementData = null;
    let isEditingName = false;
    const SERVER_URL = 'http://localhost:5001';

    loadInitialData();

    async function loadInitialData() {
        fileSystem = await loadFileSystemFromServer();
        activeFileId = getActiveFileIdFromLocalStorage();

        if (!activeFileId && fileSystem && fileSystem.length > 0) {
            activeFileId = findFirstFile(fileSystem);
        }

        initializeEditor();
        redrawFileTree();
        loadInitialFileContent();
    }

    function initializeEditor() {
        window.JSHINT_OPTIONS = {
            browser: true,
            esversion: 2021,
        };
        editor = CodeMirror(editorElement, {
            mode: 'htmlmixed',
            theme: 'material-darker',
            lineNumbers: true,
            autoCloseTags: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lint: { options: window.JSHINT_OPTIONS },
            gutters: ["CodeMirror-linenumbers", "CodeMirror-lint-markers"]
        });

        editor.on('change', debounce(() => {
            if (activeFileId && !isEditingName) {
                const file = findItemById(fileSystem, activeFileId);
                if (file && file.type === 'file') {
                    file.content = editor.getValue();
                    const mode = editor.getOption('mode');
                    if (mode === 'javascript' || (typeof mode === 'object' && mode.name === 'javascript')) {
                        setTimeout(() => editor.performLint(), 100);
                    }
                }
            }
        }, 750));
    }

    function getModeForFilename(filename) {
        if (!filename) return 'text/plain';
        const ext = filename.split('.').pop().toLowerCase();
        switch (ext) {
            case 'html': case 'htm': return 'htmlmixed';
            case 'css': return 'css';
            case 'js': return 'javascript';
            case 'json': return { name: 'javascript', json: true };
            case 'xml': return 'xml';
            case 'py': return 'python';
            case 'txt': return 'text/plain';
            default: return 'text/plain';
        }
    }

     function getIconClassForFilename(filename) {
         if (!filename) return '';
         const ext = filename.split('.').pop().toLowerCase();
         switch (ext) {
             case 'html': case 'htm': return 'icon-html';
             case 'css': return 'icon-css';
             case 'js': return 'icon-js';
             case 'json': return 'icon-json';
             case 'py': return 'icon-py';
             case 'txt': return 'icon-txt';
             default: return '';
         }
     }

    async function loadFileSystemFromServer() {
        try {
            const response = await fetch(`${SERVER_URL}/filesystem`);
            if (!response.ok) {
                 alert(`Ошибка загрузки файловой системы с сервера: ${response.status}`);
                 return [];
            }
            const data = await response.json();
            return data;
        } catch (e) {
            alert("Не удалось подключиться к серверу для загрузки файловой системы. Убедитесь, что сервер запущен.");
            return [];
        }
    }

    async function saveFileSystem() {
        if (isEditingName) {
             return false;
        }
        if (activeFileId && editor) {
            const file = findItemById(fileSystem, activeFileId);
            if (file && file.type === 'file') {
                const currentContent = editor.getValue();
                file.content = currentContent;
            }
        }
        try {
            const fsString = JSON.stringify(fileSystem);
            const response = await fetch(`${SERVER_URL}/filesystem`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: fsString,
            });

            if (!response.ok) {
                 logToConsole(`Ошибка сохранения на сервере: ${response.status}`, "error");
                 try {
                     const errorData = await response.json();
                     if(errorData.error) {
                          logToConsole(`Сервер: ${errorData.error}`, "error");
                     }
                 } catch (e) { }
                return false;
            }
            return true;
        } catch (e) {
            logToConsole(`Не удалось сохранить данные на сервер. Убедитесь, что сервер запущен.`, "error");
            return false;
        }
    }

    function saveFileSystemOnUnload() {
        if (isEditingName) {
             return;
        }
        if (activeFileId && editor) {
            const file = findItemById(fileSystem, activeFileId);
            if (file && file.type === 'file') {
                file.content = editor.getValue();
            }
        }
        try {
            const blob = new Blob([JSON.stringify(fileSystem)], { type: 'application/json' });
            navigator.sendBeacon(`${SERVER_URL}/filesystem`, blob);
        } catch (e) {
            console.error("Error using sendBeacon:", e);
        }
    }

    async function forceSave() {
        if (await saveFileSystem()) {
            const originalText = saveButton.innerHTML;
            saveButton.innerHTML = '💾 ✓';
            saveButton.style.color = 'lightgreen';
            setTimeout(() => {
                saveButton.innerHTML = originalText;
                saveButton.style.color = '';
            }, 1000);
             logToConsole("Данные сохранены.", "info");
        } else {
            const originalText = saveButton.innerHTML;
            saveButton.innerHTML = '💾 ✗';
            saveButton.style.color = 'lightcoral';
             setTimeout(() => {
                saveButton.innerHTML = originalText;
                saveButton.style.color = '';
            }, 2000);
             logToConsole("Не удалось сохранить данные (см. консоль).", "warn");
        }
    }

    function getActiveFileIdFromLocalStorage() {
        return localStorage.getItem('webEditorActiveFileIdPro') || null;
    }

    function setActiveFileId(id) {
        activeFileId = id;
        localStorage.setItem('webEditorActiveFileIdPro', id || '');
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    function findItemById(items, id) {
        if (!items || !id) return null;
        for (const item of items) {
            if (item.id === id) return item;
            if (item.type === 'folder' && item.children) {
                const found = findItemById(item.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function findItemPathIds(targetId, items = fileSystem, currentPath = []) {
         if (!items || !targetId) return null;
        for (const item of items) {
            const path = [...currentPath, item.id];
            if (item.id === targetId) {
                return path;
            }
            if (item.type === 'folder' && item.children) {
                const foundPath = findItemPathIds(targetId, item.children, path);
                if (foundPath) return foundPath;
            }
        }
        return null;
    }

    function getItemByPathIds(pathIds, items = fileSystem) {
         if (!pathIds || pathIds.length === 0) return null;
         let currentItem = { children: items };
         for (const id of pathIds) {
             if (!currentItem || !currentItem.children) return null;
             const nextItem = currentItem.children.find(child => child.id === id);
             if (!nextItem) return null;
             currentItem = nextItem;
         }
         return (currentItem && currentItem.id === pathIds[pathIds.length - 1]) ? currentItem : null;
    }

    function getParentArrayAndItem(targetId, currentItems = fileSystem) {
         if (!targetId || !currentItems) return null;
        const rootIndex = currentItems.findIndex(item => item.id === targetId);
        if (rootIndex !== -1) {
            return { parentArray: currentItems, item: currentItems[rootIndex], index: rootIndex };
        }
        for (const item of currentItems) {
            if (item.type === 'folder' && item.children) {
                const found = getParentArrayAndItem(targetId, item.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    function findFirstFile(items) {
         if (!items) return null;
        for (const item of items) {
            if (item.type === 'file') return item.id;
            if (item.type === 'folder' && item.children) {
                const firstInFolder = findFirstFile(item.children);
                if (firstInFolder) return firstInFolder;
            }
        }
        return null;
    }

    function renderFileSystem(items, parentElement) {
        items.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
        items.forEach(item => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            li.dataset.type = item.type;
            li.classList.add(item.type);
            li.draggable = true;
            if (item.type === 'file') {
                 const iconClass = getIconClassForFilename(item.name);
                 if (iconClass) li.classList.add(iconClass);
            }
            if(item.type === 'folder' && item.isOpen) li.classList.add('open');
            if (item.id === activeFileId) li.classList.add('active');

            const itemContent = document.createElement('div');
            itemContent.classList.add('item-content');
            const icon = document.createElement('span');
            icon.classList.add('icon');
            const nameSpan = document.createElement('span');
            nameSpan.classList.add('item-name');
            nameSpan.textContent = item.name;
            nameSpan.addEventListener('dblclick', (e) => {
                 e.stopPropagation();
                 if (!isEditingName) startRename(item, nameSpan, li);
            });
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('delete-btn');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Удалить';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isEditingName) deleteItem(item.id);
            });
            if (item.type === 'folder') {
                const toggle = document.createElement('span');
                toggle.classList.add('folder-toggle');
                toggle.textContent = '❯';
                itemContent.appendChild(toggle);
            }
            itemContent.appendChild(icon);
            itemContent.appendChild(nameSpan);
            itemContent.appendChild(deleteBtn);
            li.appendChild(itemContent);

            li.addEventListener('dragstart', (e) => {
                 if (isEditingName) { e.preventDefault(); return; }
                 e.stopPropagation();
                 draggedElementData = { id: item.id, element: li };
                 e.dataTransfer.setData('text/plain', item.id);
                 e.dataTransfer.effectAllowed = 'move';
                 setTimeout(() => li.style.opacity = '0.5', 0);
            });
            li.addEventListener('dragend', (e) => {
                 e.stopPropagation();
                 if (draggedElementData && draggedElementData.element) {
                     draggedElementData.element.style.opacity = '1';
                 }
                 fileTreeElement.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                 draggedElementData = null;
            });
            if (item.type === 'folder') {
                li.addEventListener('dragover', (e) => {
                     if (isEditingName) return;
                     e.preventDefault();
                     e.stopPropagation();
                     if (draggedElementData && draggedElementData.id !== item.id) {
                         const draggedPath = findItemPathIds(draggedElementData.id);
                         const targetPath = findItemPathIds(item.id);
                         if (draggedPath && targetPath && !targetPath.join('-').startsWith(draggedPath.join('-'))) {
                             e.dataTransfer.dropEffect = 'move';
                             li.classList.add('drag-over');
                         } else { e.dataTransfer.dropEffect = 'none'; }
                     } else { e.dataTransfer.dropEffect = 'none'; }
                });
                li.addEventListener('dragleave', (e) => { e.stopPropagation(); li.classList.remove('drag-over'); });
                li.addEventListener('drop', (e) => {
                     if (isEditingName) return;
                     e.preventDefault();
                     e.stopPropagation();
                     li.classList.remove('drag-over');
                     if (draggedElementData && draggedElementData.id !== item.id) {
                         const draggedItemId = draggedElementData.id;
                         const draggedPath = findItemPathIds(draggedItemId);
                         const targetPath = findItemPathIds(item.id);
                          if (draggedPath && targetPath && !targetPath.join('-').startsWith(draggedPath.join('-'))) {
                             moveItem(draggedItemId, item.id);
                         }
                     }
                     draggedElementData = null;
                });
            }
            itemContent.addEventListener('click', (e) => {
                if (!isEditingName) handleItemClick(item, li);
            });
            parentElement.appendChild(li);
            if (item.type === 'folder' && item.children) {
                const ul = document.createElement('ul');
                renderFileSystem(item.children, ul);
                li.appendChild(ul);
                ul.style.display = item.isOpen ? 'block' : 'none';
            }
        });
    }

     function handleItemClick(item, liElement) {
         if (item.type === 'folder') {
             item.isOpen = !item.isOpen;
             liElement.classList.toggle('open');
             const nestedUl = liElement.querySelector('ul');
             if (nestedUl) nestedUl.style.display = item.isOpen ? 'block' : 'none';
             saveFileSystem();
         } else if (item.type === 'file') {
             if (activeFileId !== item.id) {
                  // Сохраняем контент предыдущего активного файла перед переключением
                 if (activeFileId && editor) {
                     const previousFile = findItemById(fileSystem, activeFileId);
                     if (previousFile && previousFile.type === 'file') {
                          previousFile.content = editor.getValue();
                          saveFileSystem(); // Явно сохраняем после обновления предыдущего
                     }
                 }
                  const previousActive = fileTreeElement.querySelector('.active');
                  if (previousActive) previousActive.classList.remove('active');
                  liElement.classList.add('active');
                  setActiveFileId(item.id);
                  const fileContent = item.content || '';
                  editor.setValue(fileContent);
                  const mode = getModeForFilename(item.name);
                  editor.setOption('mode', mode);
                  setTimeout(() => {
                      if (editor.getOption('mode') === 'javascript' || (typeof editor.getOption('mode') === 'object' && editor.getOption('mode').name === 'javascript')) {
                          editor.performLint();
                      } else {
                          editor.clearGutter("CodeMirror-lint-markers");
                      }
                       editor.refresh();
                  }, 1);
             }
         }
     }

    function createTemporaryInputItem(type, parentElement, parentId = null) {
        if (isEditingName) return;
        isEditingName = true;
        const li = document.createElement('li');
        li.classList.add('editing', type);
        const itemContent = document.createElement('div');
        itemContent.classList.add('item-content');
        const icon = document.createElement('span');
        icon.classList.add('icon');
         if (type === 'file') {
             li.classList.add(getIconClassForFilename('temp.txt') || 'icon-txt');
         }
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = type === 'file' ? 'имя_файла.ext' : 'имя_папки';
        input.classList.add('name-input');
        if (type === 'folder') {
            const toggle = document.createElement('span');
            toggle.classList.add('folder-toggle');
            toggle.innerHTML = '&nbsp;';
            itemContent.appendChild(toggle);
        }
        itemContent.appendChild(icon);
        itemContent.appendChild(input);
        li.appendChild(itemContent);
        let targetUL = parentElement;
        if (parentId) {
            const parentLI = fileTreeElement.querySelector(`li[data-id="${parentId}"]`);
            if (parentLI && parentLI.dataset.type === 'folder') {
                 let ul = parentLI.querySelector('ul');
                 if (!ul) {
                     ul = document.createElement('ul');
                     parentLI.appendChild(ul);
                     if(!parentLI.classList.contains('open')) {
                         const parentItem = findItemById(fileSystem, parentId);
                         if(parentItem) {
                            parentItem.isOpen = true;
                            parentLI.classList.add('open');
                            ul.style.display = 'block';
                            saveFileSystem();
                         }
                     } else { ul.style.display = 'block'; }
                 }
                 targetUL = ul;
            }
        }
        targetUL.appendChild(li);
        input.focus();
        input.select();
        const finishEditing = (save) => {
            if (!isEditingName) return;
            const name = input.value.trim();
            li.remove();
            isEditingName = false;
            if (save && name) {
                addItem(type, name, parentId);
            } else { redrawFileTree(); }
        };
        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finishEditing(false); }
        });
    }

    function startRename(item, nameSpan, liElement) {
        if (isEditingName) return;
        isEditingName = true;
        nameSpan.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.name;
        input.classList.add('name-input');
        nameSpan.parentNode.insertBefore(input, nameSpan.nextSibling);
        input.focus();
        input.select();
        const finishEditing = (save) => {
             if (!isEditingName) return;
            const newName = input.value.trim();
            input.remove();
            nameSpan.style.display = '';
            isEditingName = false;
            if (save && newName && newName !== item.name) {
                const oldIconClass = getIconClassForFilename(item.name);
                const newIconClass = getIconClassForFilename(newName);
                item.name = newName;
                nameSpan.textContent = newName;
                if (oldIconClass !== newIconClass) {
                    if(oldIconClass) liElement.classList.remove(oldIconClass);
                    if(newIconClass) liElement.classList.add(newIconClass);
                }
                saveFileSystem();
                if(item.id === activeFileId && item.type === 'file') {
                    const newMode = getModeForFilename(newName);
                    if (editor.getOption('mode') !== newMode) {
                        editor.setOption('mode', newMode);
                         setTimeout(() => {
                            if (editor.getOption('mode') === 'javascript' || (typeof editor.getOption('mode') === 'object' && editor.getOption('mode').name === 'javascript')) {
                                editor.performLint();
                            } else { editor.clearGutter("CodeMirror-lint-markers"); }
                            editor.refresh();
                         }, 1);
                    }
                }
            } else { nameSpan.textContent = item.name; }
        };
        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finishEditing(false); }
        });
    }

    function addItem(type, name, parentId = null) {
        const newItem = { id: generateId(), name: name, type: type };
        if (type === 'file') newItem.content = '';
        else { newItem.children = []; newItem.isOpen = false; }
        let targetArray;
        let parentFolder = null;
        if (parentId) {
            parentFolder = findItemById(fileSystem, parentId);
            if (parentFolder && parentFolder.type === 'folder') {
                 if (!parentFolder.children) parentFolder.children = [];
                targetArray = parentFolder.children;
            } else { targetArray = fileSystem; parentId = null; }
        } else { targetArray = fileSystem; }
        targetArray.push(newItem);
        if (parentFolder) parentFolder.isOpen = true;
        saveFileSystem();
        redrawFileTree();
        if (newItem.type === 'file') {
            const newLi = fileTreeElement.querySelector(`li[data-id="${newItem.id}"]`);
            if (newLi) handleItemClick(newItem, newLi);
        }
    }

    function deleteItem(id) {
        const itemToDelete = findItemById(fileSystem, id);
        if (!itemToDelete) return;
        if (!confirm(`Вы уверены, что хотите удалить '${itemToDelete.name}'${itemToDelete.type === 'folder' ? ' и все его содержимое?' : '?'}`)) return;
        const result = getParentArrayAndItem(id);
        if (result) {
            result.parentArray.splice(result.index, 1);
            let idToSelect = null;
            if (activeFileId === id) {
                editor.setValue('');
                const nextFileId = findFirstFile(fileSystem);
                if (nextFileId) idToSelect = nextFileId;
                else {
                    setActiveFileId(null);
                    editor.setOption('mode', 'text/plain');
                    editor.clearGutter("CodeMirror-lint-markers");
                }
            }
            saveFileSystem();
            redrawFileTree();
            if (idToSelect) {
                 const nextLi = fileTreeElement.querySelector(`li[data-id="${idToSelect}"]`);
                 const nextFile = findItemById(fileSystem, idToSelect);
                 if (nextFile && nextLi) handleItemClick(nextFile, nextLi);
                 else setActiveFileId(null);
            } else if (activeFileId === id) {
                 setActiveFileId(null);
            }
        } else {
            logToConsole(`Ошибка: Не удалось найти родительский элемент для удаления ID: ${id}`, 'error');
        }
    }

     function moveItem(itemId, targetFolderId) {
         const itemInfo = getParentArrayAndItem(itemId);
         const targetFolder = findItemById(fileSystem, targetFolderId);
         if (!itemInfo || !targetFolder || targetFolder.type !== 'folder') {
             logToConsole("Ошибка перемещения: элемент или целевая папка не найдены.", "error");
             return;
         }
         const [movedItem] = itemInfo.parentArray.splice(itemInfo.index, 1);
         if (!targetFolder.children) targetFolder.children = [];
         targetFolder.children.push(movedItem);
         targetFolder.isOpen = true;
         saveFileSystem();
         redrawFileTree();
         if (activeFileId === itemId) {
              const movedLi = fileTreeElement.querySelector(`li[data-id="${itemId}"]`);
              if(movedLi) movedLi.classList.add('active');
              else {
                   setActiveFileId(itemId);
              }
         }
    }

    function redrawFileTree() {
        const openFolders = new Set();
        fileTreeElement.querySelectorAll('li.folder.open').forEach(li => openFolders.add(li.dataset.id));
        const currentActive = activeFileId;
        function applyOpenState(items) {
             items.forEach(item => {
                 if (item.type === 'folder') {
                     item.isOpen = openFolders.has(item.id);
                     if (item.children) applyOpenState(item.children);
                 }
             });
         }
         applyOpenState(fileSystem);
        fileTreeElement.innerHTML = '';
        renderFileSystem(fileSystem, fileTreeElement);
         if (currentActive) {
             const activeLi = fileTreeElement.querySelector(`li[data-id="${currentActive}"]`);
             if (activeLi) {
                 activeLi.classList.add('active');
             }
        }
    }

    function logToConsole(message, type = 'log') {
        const entry = document.createElement('div');
        entry.classList.add(type);
        if (typeof message === 'object') {
             try { entry.textContent = JSON.stringify(message, null, 2); }
             catch(e) { entry.textContent = "[Object]"; }
        } else { entry.textContent = String(message); }
        consoleOutputElement.appendChild(entry);
        consoleOutputElement.scrollTop = consoleOutputElement.scrollHeight;
    }

    clearConsoleBtn.addEventListener('click', () => { consoleOutputElement.innerHTML = ''; });

    function runCode() {
        if (isEditingName) return;
        if (!activeFileId) { alert("Нет активного файла для запуска."); return; }
        const file = findItemById(fileSystem, activeFileId);
        if (!file || file.type !== 'file') { alert("Активный элемент не является файлом."); return; }
        if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
             alert("Запуск этой кнопкой поддерживается только для HTML файлов (.html, .htm). Используйте кнопку 'Запустить Python' для .py файлов.");
             return;
         }
         let htmlContent = file.content || '';
         try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            const baseDirIds = findItemPathIds(file.id)?.slice(0, -1) || [];
            doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('data:')) {
                    const cssPathIds = resolveRelativePathIds(href, baseDirIds);
                    const cssFile = cssPathIds ? getItemByPathIds(cssPathIds) : null;
                    if (cssFile && cssFile.type === 'file') {
                        const style = doc.createElement('style');
                        style.textContent = cssFile.content || '';
                        link.parentNode.replaceChild(style, link);
                        logToConsole(`Встроен CSS: ${href}`, 'info');
                    } else {
                         logToConsole(`Не удалось найти CSS: ${href}`, 'warn');
                    }
                }
            });
             doc.querySelectorAll('script[src]').forEach(script => {
                 const src = script.getAttribute('src');
                  if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
                    const jsPathIds = resolveRelativePathIds(src, baseDirIds);
                    const jsFile = jsPathIds ? getItemByPathIds(jsPathIds) : null;
                    if (jsFile && jsFile.type === 'file') {
                         const newScript = doc.createElement('script');
                         newScript.textContent = jsFile.content || '';
                         if (script.type) newScript.type = script.type;
                         if (script.defer) newScript.defer = true;
                         if (script.async) newScript.async = true;
                         script.parentNode.replaceChild(newScript, script);
                         logToConsole(`Встроен JS: ${src}`, 'info');
                    } else {
                         logToConsole(`Не удалось найти JS: ${src}`, 'warn');
                    }
                 }
             });
            htmlContent = doc.documentElement.outerHTML;
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            logToConsole(`Запуск HTML файла: ${file.name}...`, 'info');
            const newWindow = window.open(url, '_blank');
            if (newWindow) {
                 setTimeout(() => {
                     try {
                         const targetConsole = newWindow.console;
                         const originalLog = targetConsole.log;
                         const originalError = targetConsole.error;
                         const originalWarn = targetConsole.warn;
                         const originalInfo = targetConsole.info;
                         targetConsole.log = (...args) => {
                             logToConsole(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '), 'log');
                             originalLog.apply(targetConsole, args);
                         };
                         targetConsole.error = (...args) => {
                             logToConsole(args.map(arg => String(arg)).join(' '), 'error');
                             originalError.apply(targetConsole, args);
                         };
                          targetConsole.warn = (...args) => {
                             logToConsole(args.map(arg => String(arg)).join(' '), 'warn');
                             originalWarn.apply(targetConsole, args);
                         };
                          targetConsole.info = (...args) => {
                             logToConsole(args.map(arg => String(arg)).join(' '), 'info');
                             originalInfo.apply(targetConsole, args);
                         };
                         newWindow.onerror = (message, source, lineno, colno, error) => {
                             logToConsole(`JS Ошибка: ${message} (строка: ${lineno})`, 'error');
                         };
                          newWindow.onunhandledrejection = (event) => {
                            logToConsole(`Необработанный Promise reject: ${event.reason}`, 'error');
                         };
                     } catch (e) {
                         logToConsole("Не удалось перехватить консоль в новом окне.", "warn");
                     }
                 }, 150);
             } else {
                 logToConsole("Не удалось открыть новое окно.", "error");
                 alert("Не удалось открыть новое окно. Возможно, оно заблокировано вашим браузером.");
             }
         } catch (e) {
              logToConsole(`Критическая ошибка при подготовке или запуске HTML: ${e.message}`, "error");
              alert("Не удалось запустить HTML код. См. консоль редактора для деталей.");
         }
    }

    async function runPythonCode() {
        if (isEditingName) return;
        if (!activeFileId) { alert("Нет активного файла для запуска."); return; }
        const file = findItemById(fileSystem, activeFileId);
        if (!file || file.type !== 'file') { alert("Активный элемент не является файлом."); return; }
        if (!file.name.toLowerCase().endsWith('.py')) {
             alert("Эта кнопка предназначена только для запуска Python файлов (.py).");
             return;
        }
        const pythonCode = file.content || '';
        if (!pythonCode.trim()) {
            logToConsole("Python файл пуст.", "warn");
            return;
        }
        logToConsole(`Отправка ${file.name} на сервер...`, 'info');
        const serverUrl = 'http://localhost:5001/execute/python';
        try {
            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: pythonCode }),
            });
            if (!response.ok) {
                logToConsole(`Ошибка сервера: ${response.status} ${response.statusText}`, 'error');
                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        logToConsole(`Сообщение сервера: ${errorData.error}`, 'error');
                    }
                } catch (e) { }
                return;
            }
            const result = await response.json();
            logToConsole(`--- Результат ${file.name} ---`, 'info');
            if (result.stdout) {
                logToConsole(result.stdout, 'log');
            }
            if (result.stderr) {
                logToConsole(result.stderr, 'error');
            }
            logToConsole(`--- Конец вывода ${file.name} ---`, 'info');
        } catch (error) {
            logToConsole(`Ошибка сети или соединения с сервером (${serverUrl}). Убедитесь, что сервер запущен.`, 'error');
            logToConsole(error.message, 'error');
        }
    }

    function resolveRelativePathIds(relativePath, basePathIds) {
        const pathSegments = relativePath.split('/').filter(s => s && s !== '.');
        let currentPathIds = [...basePathIds];
        for (const segment of pathSegments) {
            if (segment === '..') {
                if (currentPathIds.length > 0) {
                    currentPathIds.pop();
                } else {
                     return null;
                }
            } else {
                 const parentDir = currentPathIds.length > 0 ? getItemByPathIds(currentPathIds) : { children: fileSystem };
                 if (parentDir && parentDir.children) {
                     const targetItem = parentDir.children.find(item => item.name === segment);
                     if (targetItem) {
                         currentPathIds.push(targetItem.id);
                     } else {
                         return null;
                     }
                 } else {
                     return null;
                 }
            }
        }
        return currentPathIds;
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    createFileBtn.addEventListener('click', () => {
        if (!isEditingName) createTemporaryInputItem('file', fileTreeElement);
    });
    createFolderBtn.addEventListener('click', () => {
         if (!isEditingName) createTemporaryInputItem('folder', fileTreeElement);
    });
    saveButton.addEventListener('click', forceSave);
    runButton.addEventListener('click', runCode);
    runPythonBtn.addEventListener('click', runPythonCode);

    window.addEventListener('beforeunload', (event) => {
        if (activeFileId) {
            const file = findItemById(fileSystem, activeFileId);
            if (file && file.type === 'file') {
                const currentContent = editor.getValue();
                file.content = currentContent;
            }
        }
        saveFileSystemOnUnload(); // Используем sendBeacon при выгрузке
        // Не отменяем выгрузку, просто пытаемся отправить данные
    });

    function loadInitialFileContent() {
        if (activeFileId) {
            const file = findItemById(fileSystem, activeFileId);
            const liElement = fileTreeElement.querySelector(`li[data-id="${activeFileId}"]`);
            if (file && file.type === 'file' && liElement) {
                handleItemClick(file, liElement);
            } else if (file && file.type === 'file' && !liElement) {
                setActiveFileId(null);
                 const firstFileId = findFirstFile(fileSystem);
                 if(firstFileId) {
                     const firstFile = findItemById(fileSystem, firstFileId);
                     const firstLi = fileTreeElement.querySelector(`li[data-id="${firstFileId}"]`);
                     if(firstFile && firstLi) handleItemClick(firstFile, firstLi);
                 } else {
                      editor.setValue('');
                      editor.setOption('mode', 'text/plain');
                      editor.clearGutter("CodeMirror-lint-markers");
                 }
            } else if (!file && activeFileId) {
                 setActiveFileId(null);
                 const firstFileId = findFirstFile(fileSystem);
                 if(firstFileId) {
                     const firstFile = findItemById(fileSystem, firstFileId);
                     const firstLi = fileTreeElement.querySelector(`li[data-id="${firstFileId}"]`);
                     if(firstFile && firstLi) handleItemClick(firstFile, firstLi);
                 } else {
                      editor.setValue('');
                      editor.setOption('mode', 'text/plain');
                      editor.clearGutter("CodeMirror-lint-markers");
                 }
            }
        } else if (fileSystem && fileSystem.length > 0) {
             const firstFileId = findFirstFile(fileSystem);
             if(firstFileId) {
                 const firstFile = findItemById(fileSystem, firstFileId);
                 const firstLi = fileTreeElement.querySelector(`li[data-id="${firstFileId}"]`);
                 if(firstFile && firstLi) handleItemClick(firstFile, firstLi);
             }
        } else {
              editor.setValue('');
              editor.setOption('mode', 'text/plain');
              editor.clearGutter("CodeMirror-lint-markers");
        }
    }

});

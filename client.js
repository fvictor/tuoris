/* Visualize a portion of the visualization given by the normalized view box */
function view(SVGelement, normViewbox) {
  const idToHtml = {};
  const viewbox = [0, 0, 0, 0];
  const changes = [];
  const processedElements = [];

  idToHtml['0'] = SVGelement;

  loop(idToHtml, viewbox, changes, processedElements);

  const viewboxStr = normViewbox.join(' ');
  const viewboxData = `viewbox=${viewboxStr}`;

  const socket = io('/dist-view-namespace', { reconnection: true, query: viewboxData });

  socket.on('update', (ch) => {
    for (const i in ch) changes.push(ch[i]);
    changes.push([3]);
  });

  // Currently unused
  socket.on('render', (timeStamp) => {});

  socket.on('clear', () => {
    changes.length = 0;
    processedElements.length = 0;
    clear(SVGelement, idToHtml);
    idToHtml['0'] = SVGelement;
  });
}

/* Recursively delete all descendants of a given element */
function recursivelyDelete(element) {
  while (element.hasChildNodes()) {
    const child = element.lastChild;
    recursivelyDelete(child);
    element.removeChild(child);
  }
}

/* Clear the index for elements */
function clear(SVGelement, idToHtml) {
  recursivelyDelete(SVGelement);
  for (const i in idToHtml) delete idToHtml[i];
}

/* Override current CSS rules */
function setCSS(cssRules) {
  const styleElements = document.getElementsByTagName('style');
  for (let i = 0; i < styleElements.length; i++) {
    const styleElement = styleElements[i];
    styleElement.parentElement.removeChild(styleElement);
  }

  for (const i in cssRules) {
    const stylesheet = cssRules[i];
    const s = document.createElement('style');
    s.type = 'text/css';
    s.innerText = '';
    for (const j in stylesheet) s.innerText += stylesheet[j];
    document.head.appendChild(s);
  }
}

/* Compute the normalized view box given the index of a screen
 * and the number of rows and columns
*/
function getNormalizedViewbox(index, rows, columns) {
  const viewWidth = 1.0 / columns;
  const viewHeight = 1.0 / rows;

  const gridX = index % columns;
  let gridY = (index - gridX) / columns;
  gridY = (rows - 1) - gridY; // Reverse

  return [gridX*viewWidth, gridY*viewHeight, viewWidth, viewHeight];
}

/* Create a node */
function createNode(tag, namespaceURI, textContent, id, idToHtml) {
  let node;
  if (namespaceURI) node = document.createElementNS(namespaceURI, tag);
  else if (tag) node = document.createElement(tag);
  else node = document.createTextNode(textContent);
  idToHtml[id] = node;
  return node;
}

/* Set the parent of a node */
function setNodeParent(node, parentID, idToHtml) {
  if (parentID!==null) {
    const nextParentNode = idToHtml[parentID];
    if (node.parentNode !== nextParentNode) {
      if (node.parentNode) node.parentNode.removeChild(node);

      if (!nextParentNode.lastElementChild) {
        nextParentNode.appendChild(node);
      } else {
        let currentChild = nextParentNode.lastElementChild;
        if (node.additionOrder > currentChild.additionOrder) {
          nextParentNode.appendChild(node);
        } else {
          while (currentChild.previousElementSibling && node.additionOrder < currentChild.previousElementSibling.additionOrder) {
            currentChild = currentChild.previousElementSibling;
          }
          nextParentNode.insertBefore(node, currentChild);
        }
      }
    }
  } else {
    if (id != 0 && node.parentNode) node.parentNode.removeChild(node);
  }
}

/* Update local view box */
function updateViewBox(entry, normalizedViewbox, viewbox, SVGelement) {
  const serverViewbox = entry[1];
  const initialX = serverViewbox[0];
  const initialY = serverViewbox[1];
  const finalX = serverViewbox[0] + serverViewbox[2];
  const finalY = serverViewbox[1] + serverViewbox[3];

  const left = initialX + (normalizedViewbox[0]) * (finalX - initialX);
  const top = initialY + (normalizedViewbox[1]) * (finalY - initialY);
  const width =  normalizedViewbox[2] * (finalX - initialX);
  const height = normalizedViewbox[3] * (finalY - initialY);
  const right = left+width;
  const bottom = top+height;
  viewbox[0] = left; viewbox[1] = top; viewbox[2] = right; viewbox[3] = bottom;
  
  SVGelement.setAttribute('viewBox', ""+left+" "+top+" "+width+" "+height);
  SVGelement.setAttribute('preserveAspectRatio', 'none');
}

/* Remove every non visible element */
function removeNonVisibleElements(start, processedElements, viewbox, idToHtml) {
  let processedCount = 0;
  while(processedElements.length > 0 && (Date.now()-start) < 30) {
    processedCount += 1;
    var entry = processedElements.pop();
    var type = entry[0];
    if (type === 0) {
      var id = entry[1];
      const hasBoundingBox = entry[7] !== null;
      var node = idToHtml[id];
      if (id != 0 && hasBoundingBox
        && !( entry[7] <= viewbox[2] && entry[9] >= viewbox[0] && entry[8] <= viewbox[3] && entry[10] >= viewbox[1])
        && !node.lastElementChild && node.parentNode)
          node.parentNode.removeChild(node);
    }
  }

  // If not finished, do not remove this entry
  if(processedElements.length > 0) deleteCount--;
}

/* Update a given element */
function updateElement(entry, processedElements, idToHtml) {
  var id = entry[1];
  processedElements.push(entry);
  var parentID = entry[2];
  var tag = entry[3];
  var namespaceURI = entry[4];
  var attributes = entry[5];
  var textContent = entry[6];
  const additionOrder = entry[11];

  var node;
  if (id in idToHtml) node = idToHtml[id];
  else  node = createNode(tag, namespaceURI, textContent, id, idToHtml);
  node.additionOrder = additionOrder;

  for (const attributeName in attributes) {
    const prevValue = node.getAttribute(attributeName);
    const nextValue = attributes[attributeName];
    if(prevValue!==nextValue) {
      if(nextValue===null) node.removeAttribute(attributeName);
      else node.setAttribute(attributeName, attributes[attributeName]);
    }
  }

  setNodeParent(node, parentID, idToHtml);
}

/* Main loop */
function loop(idToHtml, viewbox, changes, processedElements) {
  (function internalLoop() {
    requestAnimationFrame(internalLoop);
  
    const SVGelement = idToHtml['0'];
    if(SVGelement) {
      var start = Date.now();
      var deleteCount = 0;
      for (var i=0;i<changes.length && (Date.now()-start) < 30;i++) {
        deleteCount++;
        var entry = changes[i];
        var type = entry[0];
      
        if (type === 0) {
          updateElement(entry, processedElements, idToHtml);
        } else if (type === 1) {
          setCSS(entry[1]);
        } else if (type === 2) {
          updateViewBox(entry, normalizedViewbox, viewbox, SVGelement);
        } else if(type === 3) {
          removeNonVisibleElements(start, processedElements, viewbox, idToHtml);
        }
      }
  
      changes.splice(0, deleteCount);
    }
  })();
}
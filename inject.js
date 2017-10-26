(function () {
  const changes = [];
  const pendingMutations = [];
  const idToNode = {};
  const attributes = {};
  const changedIds = {};
  let send = false;
  let SVGelement;
  let invSVGScreenCTM;
  let point;
  let internalIDNumber = 1;

  const socket = io(`/internal-view-namespace-${___ID___}`, { transports: ['websocket'], upgrade: false, reconnection: false });
  socket.on('ready', () => { send = true; });

  // Avoid bug with scrollbar in interactive mode
  if (typeof (history.scrollRestoration) === typeof (Function)) {
    history.scrollRestoration = 'manual';
  }

  /* Get viewBox area */
  function getViewBox(node) {
    if (node.hasAttribute('viewBox')) {
      const viewBoxRaw = node.getAttribute('viewBox').split(' ');
      return [parseFloat(viewBoxRaw[0]), parseFloat(viewBoxRaw[1]), parseFloat(viewBoxRaw[2]), parseFloat(viewBoxRaw[3])];
    }
    const rect = node.getBoundingClientRect();
    return [0, 0, rect.width, rect.height];
  }

  /* Mark all children of a node as changed */
  function markChildrenAsChanged(node) {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (child.internalID) {
        changedIds[child.internalID] = true;
        markChildrenAsChanged(child);
      }
    }
  }

  /* Set an attribute of a given node */
  function setAttribute(node, attributeName, value) {
    changedIds[node.internalID] = true;
    markChildrenAsChanged(node);

    if (!(attributeName in attributes)) {
      attributes[attributeName] = [];
    }
    const attributeList = attributes[attributeName];

    attributeList.push(node.internalID);
    attributeList.push(value);
  }

  /* Check if element is inside the SVG container */
  function isUnderSVG(element) {
    if (element.hasOwnProperty('safeParent') && (element.safeParent.hasOwnProperty('internalID'))) {
      if (element.safeParent.internalID === 0) {
        return true;
      }
      return isUnderSVG(element.safeParent);
    }
    return false;
  }

  /* Compute bounding box and add it to the output stream */
  function pushBoundingBox(changes, element, id) {
    if (typeof (element.getBoundingClientRect) === typeof (Function)) {
      const rawBB = element.getBoundingClientRect();

      point.x = rawBB.left + window.scrollX;
      point.y = rawBB.top + window.scrollY;
      const upperLeft = point.matrixTransform(invSVGScreenCTM);

      point.x = rawBB.right + window.scrollX;
      point.y = rawBB.bottom + window.scrollY;
      const bottomRight = point.matrixTransform(invSVGScreenCTM);


      if (upperLeft.x !== 0 || upperLeft.y !== 0 || bottomRight.x !== 0 || bottomRight.y !== 0) {
        changes.push(3, id, upperLeft.x, upperLeft.y, bottomRight.x, bottomRight.y);
      }
    }
  }

  /* Listen to changes in the document and add them to pending mutations */
  function mutationListener(mutations) {
    for (let i = 0; i < mutations.length; i += 1) {
      const mutation = mutations[i];
      if (mutation.type === 'attributes') {
        mutation.newValue = mutation.target.getAttribute(mutation.attributeName);
      }
      pendingMutations.push(mutation);
    }
  }

  /* Create and start observer */
  const observer = new MutationObserver(mutationListener);
  observer.observe(document, {
    attributes: true, childList: true, characterData: true, subtree: true,
  });

  /* Send CSS rules on document load */
  window.addEventListener('load', () => {
    const myStyleSheets = [];
    for (let i = 0; i < document.styleSheets.length; i += 1) {
      const styleSheet = document.styleSheets[i];
      const myStyleSheet = [];
      myStyleSheets.push(myStyleSheet);
      if (styleSheet.cssRules) {
        for (let j = 0; j < styleSheet.cssRules.length; j += 1) {
          myStyleSheet.push(styleSheet.cssRules[j].cssText);
        }
      }
    }
    changes.push(5, myStyleSheets);
  });

  /* Process the mutation of an attribute */
  function processAttributeMutation(mutation) {
    const node = mutation.target;
    if (node.internalID === 0) {
      changes.push(6, getViewBox(node));
      invSVGScreenCTM = node.getScreenCTM().inverse();
    } else if ('internalID' in node && isUnderSVG(node)) {
      setAttribute(node, mutation.attributeName, mutation.newValue);
    }
  }

  /* Process the mutation of a child of a node */
  function processChildMutation(mutation, node) {
    if (node.tagName === 'svg' && SVGelement === undefined) {
      node.internalID = 0;
      idToNode[0] = node;
      SVGelement = node;
      invSVGScreenCTM = SVGelement.getScreenCTM().inverse();
      point = SVGelement.createSVGPoint();
      changes.push(6, getViewBox(node));
    } else {
      // Parent backup to be used on node deletion event
      node.safeParent = mutation.target;
      if (isUnderSVG(node)) {
        if (!('internalID' in node)) {
          node.internalID = internalIDNumber;
          internalIDNumber += 1;
        }
        idToNode[node.internalID] = node;
        changedIds[node.internalID] = true;
        markChildrenAsChanged(node);

        changes.push(
          0, node.internalID, node.tagName,
          mutation.target.internalID, node.namespaceURI,
        );

        if (node.tagName === 'text' || typeof node.tagName === 'undefined') {
          changes.push(node.textContent);
        } else {
          changes.push(undefined);
        }


        // Find a better solution!
        let order;
        if (mutation.previousSibling && mutation.nextSibling) {
          order = (mutation.previousSibling.order + mutation.nextSibling.order) / 2.0;
        } else if (mutation.previousSibling) {
          order = mutation.previousSibling.order + 1;
        } else if (mutation.nextSibling) {
          order = mutation.nextSibling.order - 1;
        } else {
          order = 0;
        }
        node.order = order;

        changes.push(order);


        const nodeAttributes = node.attributes;
        if (nodeAttributes) {
          for (let j = 0; j < nodeAttributes.length; j += 1) {
            const attrName = nodeAttributes[j].name;
            setAttribute(node, attrName, node.getAttribute(attrName));
          }
        }
      }
    }
  }

  /* Process the mutation of the child list of a node */
  function processChildListMutation(mutation) {
    const addedNodes = mutation.addedNodes;
    for (let i = 0; i < addedNodes.length; i += 1) {
      processChildMutation(mutation, addedNodes[i]);
    }

    const removedNodes = mutation.removedNodes;
    for (let i = 0; i < removedNodes.length; i += 1) {
      const node = removedNodes[i];
      if (node.hasOwnProperty('internalID') && isUnderSVG(node)) {
        changedIds[node.internalID] = true;
        markChildrenAsChanged(node);
        delete node.safeParent;
        changes.push(1, node.internalID);
      }
    }
  }

  /* Process mutations for 30ms */
  function processMutations() {
    const start = Date.now();

    let deleteCount = 0;
    for (let iter = 0; (iter < pendingMutations.length) && ((Date.now() - start) < 30); iter += 1) {
      const mutation = pendingMutations[iter];
      deleteCount += 1;

      if (mutation.type === 'attributes') {
        processAttributeMutation(mutation);
      } else if (mutation.type === 'childList') {
        processChildListMutation(mutation);
      }
    }

    pendingMutations.splice(0, deleteCount);
  }

  /* Send accumulated changes */
  function sendChanges() {
    for (const attribute in attributes) {
      const attributeEntry = attributes[attribute];
      changes.push(2, attribute, attributeEntry);
    }

    for (const id in changedIds) { pushBoundingBox(changes, idToNode[id], id); }

    if (changes.length > 0) {
      send = false;
      socket.emit('update', changes);
      changes.length = 0;
      for (attribute in attributes) delete attributes[attribute];
      for (id in changedIds) delete changedIds[id];
    }
  }

  /* Main loop */
  (function loop() {
    requestAnimationFrame(loop);
    processMutations();
    if (send) sendChanges();
  }());

  return observer;
}());

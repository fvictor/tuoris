const puppeteer = require('puppeteer');
const fs = require('fs');
const express = require('express');
const http = require('http');
const io = require('socket.io');
const request = require('sync-request');
const uri2path = require('file-uri-to-path');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');
const { URL } = require('url');
const proxy = require('express-http-proxy');

/**
  * VisualizationServer
  */
class VisualizationServer {
  /**
   * Create and initialize a server instance
   */
  static initializeServer(port, interactive, defaultPage, folders, localfileurls, variables) {
    puppeteer.launch({ executablePath: process.env.CHROME_BIN || null, args: ['--no-sandbox'] }).then((browser) => {
      const visServer = new VisualizationServer(browser, port, interactive, defaultPage, folders, localfileurls, variables);
      visServer.startServer();
    });
  }

  /**
   * Check if the rect and the viewbox are overlaping
   */
  static isOverlaping(rect, viewbox) {
    return rect.left <= viewbox.right && rect.right >= viewbox.left &&
      rect.top <= viewbox.bottom && rect.bottom >= viewbox.top;
  }

  /**
   * Private constructor (do not call it!)
   */
  constructor(browser, port, interactive, defaultPage, folders, localfileurls, variables) {
    this.app = express();
    this.http = http.Server(this.app);
    this.io = io(this.http);
    this.nio = this.io.of('/dist-view-namespace');
    this.browser = browser;
    this.port = port;
    this.interactive = interactive;
    this.defaultPage = defaultPage;
    this.folders = folders;
    this.localfileurls = localfileurls;
    this.variables = variables;
    this.resetStatus();
  }

  /**
   * Reset visualization status
   */
  resetStatus() {
    this.currentStatus = [];
    this.cssRules = [];
    this.currentStatus[0] = { id: 0, attributes:{} };
    this.viewboxChanged = false;
    this.svgViewbox = [0, 0, 0, 0];
    this.served = false;
    this.id = Date.now();
  }

  /**
   * Execute Javascript code in the visualization
   */
  execute(functionString) {
    return this.page.evaluate(functionString);
  }

  /**
   * Send the current status of the visualization to a viewer
   */
  sendCurrentStatusToViewer(socket) {
    const changes = [[2, this.svgViewbox], [1, this.cssRules]];
    const sent = new Set();

    const viewbox = this.computeViewbox(socket.viewbox);
    this.currentStatus.forEach(element =>
      this.pushElementAndAncestorsByBoundingBox(changes, element.id, sent, socket, viewbox));
    socket.emit('clear');
    socket.emit('update', changes);
    socket.emit('render', Date.now());
  }

  /**
   * Initialize file server
   */
  initializeFileServer() {
    this.nio.on('connection', (socket) => {
      const constSocket = socket;
      constSocket.viewbox = socket.handshake.query.viewbox.split(' ').map(x => parseFloat(x));
      this.sendCurrentStatusToViewer(socket);
    });

    this.app.all('*', (req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    this.folders.forEach( (folder) => this.app.use('/', express.static(folder)) );

    this.app.get('/', (req, res) => {
      res.send(fs.readFileSync('viewer.html', 'utf8'));
    });

    this.app.get('/TUORIS/client.js', (req, res) => {
      res.send(fs.readFileSync('client.js', 'utf8'));
    });
  }

  /**
   * Initialize the control
   */
  initializeControl() {
    this.app.get('/control', (req, res) => {
      if (this.served) {
        res.send('The control can only be launched once. Reload the visualization to launch a new control.');
      } else {
        try {
          let visualizationDocument;
          if (this.url.startsWith('http')) {
            const dom = new JSDOM('' + request('GET', this.url).getBody());
            const $ = jquery(dom.window);
            $('script, source, img, frame, iframe').each((_i, e) => {
              if (e.src && e.src !== '') {
                e.src = new URL(e.src, this.url).href;
              }
            });
            $('a, link').each((_i, e) => {
              if (e.href && e.href !== '') {
                e.href = new URL(e.href, this.url).href;
              }
            });
            visualizationDocument = dom.window.document.documentElement.outerHTML;
          } else if (this.localfileurls) {
            visualizationDocument = fs.readFileSync(this.url.startsWith('file') ? uri2path(this.url) : this.url, 'utf8');
          } else {
            res.send('Unable to load URL.');
            return;
          }
          this.served = true;
          let string = "<script src='/socket.io/socket.io.js'></script>";
          string += "<script type='text/javascript'>";
          Object.keys(this.variables).forEach((variable) => { string += `var ${variable} = '${this.variables[variable]}';`; });
          string += `var ___ID___ =${this.id};`;
          string += fs.readFileSync('inject.js', 'utf8');
          string += '</script>';
          string += visualizationDocument;
          res.send(string);
        } catch(e) {
          console.log(e.message);
          res.send("Error: "+e.message);
        }
      }
    });
    const self = this;
    function getURL() {
      return self.url;
    }
    this.app.use('/control', proxy(getURL, {
      proxyReqPathResolver: (req) => {
        let parts = req.url.split('?');
        let queryString = parts[1];
        let updatedPath = new URL(parts[0].substring(1), self.url).href;
        return updatedPath + (queryString ? '?' + queryString : '');
      }
    }));
    this.app.use('/', proxy(getURL, {
      proxyReqPathResolver: (req) => {
        let parts = req.url.split('?');
        let queryString = parts[1];
        let updatedPath = new URL('../' + parts[0].substring(1), self.url).href;
        return updatedPath + (queryString ? '?' + queryString : '');
      }
    }));
  }

  /**
   * Initialize the command server
   */
  initializeCommandServer() {
    this.app.all('/command', (req, res) => {
      res.setHeader('content-type', 'text/plain');
      let response = '';
      Object.keys(req.query).forEach((command) => {
        const value = decodeURIComponent(req.query[command]);
        if (command === 'execute') {
          this.execute(value).then((result) => { response = result; });
        } else if (command === 'mount') {
          this.setContent(value);
        } else {
          response = 'Unknown command';
        }
      });
      res.send(response);
    });
  }

  /**
   * Initialize the page of the visualization
   */
  initPage(url) {
    this.browser.newPage().then((page) => {
    // Add remaining events
      page.on('console', console.log);
      this.nio.emit('clear');

      this.page = page;
      this.url = url;
      this.resetStatus();

      this.iio = this.io.of(`/internal-view-namespace-${this.id}`);
      this.iio.on('connection', (socket) => {
        socket.emit('ready');
        socket.on('update', (changes) => {
          this.sendUpdatesToViewers(changes);
          this.nio.emit('render', Date.now());
          socket.emit('ready');
        });
      });

      Object.keys(this.nio.sockets).forEach((socket) => {
        this.nio.sockets[socket].requestInitialization = true;
      });

      if (!this.interactive) { this.page.goto(`http://127.0.0.1:${this.port}/control`); }
    });
  }

  /**
   * Set visualization content
   */
  setContent(url) {
    if (this.iio) {
      Object.keys(this.iio.connected).forEach(socketId =>
        this.iio.connected[socketId].disconnect());
      this.iio.removeAllListeners();
      delete this.io.nsps[`/internal-view-namespace-${this.id}`];
    }

    if (this.page) this.page.close().then(() => this.initPage(url));
    else this.initPage(url);
  }

  /**
   * Send updates of the visualization to the viewers
   */
  sendUpdatesToViewers(allChanges) {
    const updated = this.applyUpdates(allChanges);
    Object.keys(this.nio.sockets).forEach((name) => {
      const socket = this.nio.sockets[name];
      const viewbox = this.computeViewbox(socket.viewbox);
      const send = [];
      const sent = new Set();
      if (this.viewboxChanged) send.push([2, this.svgViewbox]);
      if (this.cssRulesChanged) send.push([1, this.cssRules]);
      if (this.parentAttributesChanged) {
        send.push([0, 0, undefined, undefined, undefined, this.currentStatus[0].attributes, undefined]);
      }
      updated.forEach(id =>
        this.pushElementAndAncestorsByBoundingBox(send, id, sent, socket, viewbox));
      if (send.length > 0) socket.emit('update', send);
    });

    this.cssRulesChanged = false;
    this.viewboxChanged = false;
    this.parentAttributesChanged = false;

    // Update the old bounding boxes
    this.currentStatus.forEach((element) => { if (Object.prototype.hasOwnProperty.call(element, 'BB')) { const e = element; e.oldBB = element.BB; } });
  }

  /**
   * Compute the actual viewbox for a given normalized viewbox
   */
  computeViewbox(normViewbox) {
    const left = this.svgViewbox[0] + (normViewbox[0] * this.svgViewbox[2]);
    const top = this.svgViewbox[1] + (normViewbox[1] * this.svgViewbox[3]);
    return {
      left,
      right: left + (normViewbox[2] * this.svgViewbox[2]),
      top,
      bottom: top + (normViewbox[3] * this.svgViewbox[3]),
    };
  }

  /**
   * Consume element addition
   */
  consumeAdd(changes, i, updated) {
    const id = changes[i + 1];
    updated.add(id);
    if (!this.currentStatus[id]) {
      this.currentStatus[id] = {
        id, tag: changes[i + 2], namespaceURI: changes[i + 4], attributes: {},
      };

      if (typeof changes[i + 5] !== 'undefined') {
        this.currentStatus[id].textContent = changes[i + 5];
      }
    }
    this.currentStatus[id].parentID = changes[i + 3];
    this.currentStatus[id].additionOrder = changes[i + 6];
    return 7;
  }

  /**
   * Consume element removal
   */
  consumeRemove(changes, i, updated) {
    updated.add(changes[i + 1]);
    this.currentStatus[changes[i + 1]].parentID = undefined;
    return 2;
  }

  /**
   * Consume attribute setting
   */
  consumeSetAttribute(changes, i, updated) {
    const name = changes[i + 1];
    const value = changes[i + 2];
    for (let j = 0; j < value.length; j += 2) {
      if (value[j] === 0) {
        this.parentAttributesChanged = true;
      } else {
        updated.add(value[j]);
      }
      this.currentStatus[value[j]].attributes[name] = value[j + 1];
    }
    return 3;
  }

  /**
   * Consume bounding box
   */
  consumeBoundingBox(changes, i, updated) {
    updated.add(changes[i + 1]);
    this.currentStatus[changes[i + 1]].BB =
      {
        left: changes[i + 2], top: changes[i + 3], right: changes[i + 4], bottom: changes[i + 5],
      };
    return 6;
  }

  /**
   * Consume CSS rule list
   */
  consumeCSSRules(changes, i) {
    this.cssRules = changes[i + 1];
    this.cssRulesChanged = true;
    return 2;
  }

  /**
   * Consume view box update
   */
  consumeViewBox(changes, i) {
    this.svgViewbox = changes[i + 1];
    this.viewboxChanged = true;
    return 2;
  }

  /**
   * Apply the updates to the current visualization status and return the id of changed elements
   */
  applyUpdates(changes) {
    const updated = new Set();
    let i = 0;
    while (i < changes.length) {
      const type = changes[i + 0];
      if (type === 0) i += this.consumeAdd(changes, i, updated);
      else if (type === 1) i += this.consumeRemove(changes, i, updated);
      else if (type === 2) i += this.consumeSetAttribute(changes, i, updated);
      else if (type === 3) i += this.consumeBoundingBox(changes, i, updated);
      else if (type === 5) i += this.consumeCSSRules(changes, i);
      else if (type === 6) i += this.consumeViewBox(changes, i);
    }
    return updated;
  }

  /**
   * Include an element and its ancestors in the output stream
   */
  pushElementAndAncestors(send, id, sent) {
    const reverseInclude = [];
    let currentId = id;
    while (currentId) {
      const element = this.currentStatus[currentId];
      if (!sent.has(currentId)) {
        reverseInclude.push(element);
        sent.add(currentId);
      }
      currentId = element.parentID;
    }

    for (let i = reverseInclude.length - 1; i >= 0; i -= 1) {
      const elem = reverseInclude[i];
      const obj = [0, elem.id, elem.parentID, elem.tag,
        elem.namespaceURI, elem.attributes, elem.textContent];
      if (elem.BB) obj.push(elem.BB.left, elem.BB.top, elem.BB.right, elem.BB.bottom);
      else obj.push(undefined, undefined, undefined, undefined);
      obj.push(elem.additionOrder);
      send.push(obj);
    }
  }

  /**
   * Include an element and its ancestors in the output stream considering its bounding box
   */
  pushElementAndAncestorsByBoundingBox(send, id, sent, socket, viewbox) {
    const element = this.currentStatus[id];
    if (element.BB) {
      const condition = VisualizationServer.isOverlaping(element.BB, viewbox) ||
        (element.oldBB && VisualizationServer.isOverlaping(element.oldBB, viewbox));
      if (condition) this.pushElementAndAncestors(send, id, sent);
    } else {
      this.pushElementAndAncestors(send, id, sent);
    }
  }

  /**
   * Launch the server
   */
  startServer() {
    this.http.listen(this.port, () => {
      this.initializeFileServer();
      this.initializeCommandServer();
      this.initializeControl();
      this.setContent(this.defaultPage);
      console.log('Server started at port %s', this.port);
    });
  }
}

module.exports = {
  VisualizationServer
};

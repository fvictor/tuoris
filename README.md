# Tuoris
A middleware for SVG distributed visualization in scalable resolution tiled display walls.

# Installation

```sh
$ git clone https://github.com/fvictor/tuoris.git
$ cd tuoris
$ npm install
```

# Execution
Given a *yourvisualization.html* document containing a SVG element, run: 
```sh
$ node index.js -d yourvisualization.html
```
The visualization will be available at http://*\<server-ip\>*:8080?id=*\<id\>*&rows=*\<rows\>*&columns=*\<columns\>*, where:
  * *\<id\>* is the id of the screen, starting from 1 and assuming that screen indices grow from left to right and from bottom to top.
  * *\<rows\>* is the number of rows in the system, set to 4 by default.
  * *\<columns\>* is the number of columns in the system, set to 16 by default.
  

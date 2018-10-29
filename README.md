# Tuoris
[![Build Status](https://travis-ci.com/fvictor/tuoris.svg?branch=master)](https://travis-ci.com/fvictor/tuoris)

Tuoris is a middleware for SVG distributed visualization in scalable resolution tiled display walls. Tuoris allows you to efficiently render complex, interactive and resolution independent visualizations, built using standard web technologies, in large-scale tiled display walls.

![](https://user-images.githubusercontent.com/1686431/35565570-58ae9d80-05be-11e8-9889-e9cd592c4024.JPG)
![](https://user-images.githubusercontent.com/1686431/35565578-5e785fda-05be-11e8-8ff8-fa908fa5a4ae.JPG)

# Installation

```sh
$ git clone https://github.com/fvictor/tuoris.git
$ cd tuoris
$ npm install
```

# Execution
Given a *yourvisualization.html* document containing a SVG element, run: 
```sh
$ node index.js -l -d yourvisualization.html
```
The visualization will be available at http://*\<server-ip\>*:8080?id=*\<id\>*&rows=*\<rows\>*&columns=*\<columns\>*, where:
  * *\<id\>* is the id of the screen, starting from 1 and assuming that screen indices grow from left to right and from bottom to top.
  * *\<rows\>* is the number of rows in the system, set to 4 by default.
  * *\<columns\>* is the number of columns in the system, set to 16 by default.
  

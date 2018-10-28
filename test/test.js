
var expect = require('chai').expect;
var server = require('../server').VisualizationServer;

describe('Testing isOverlapping', function () {

  it('Rects are overlapping', function () {
    rect = {left: -1, right: 1, top: -1, bottom: 1};
    viewbox = {left: -10, right: 10, top: -10, bottom: 10};
    isOverlaping = server.isOverlaping(rect, viewbox);
    expect(isOverlaping).to.be.true;
  });

  it('Rects are not overlapping', function () {
    rect = {left: 11, right: 20, top: -10, bottom: 10};
    viewbox = {left: -10, right: 10, top: -10, bottom: 10};
    isOverlaping = server.isOverlaping(rect, viewbox);
    expect(isOverlaping).to.be.false;
  });

});
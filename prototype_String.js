'use strict';

// Hashes string to 32-bit signed int.
String.prototype.hashCode = function() {
  let hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return (hash >>> 0);
}

// Returns true every [period] ticks.
String.prototype.hashTime = function(period) {
    return this.hashCode() % period == Game.time % period;
}

String.prototype.isCenterNine = function() {
  let parsed = /^[WE]([1-9][0-9]*)[NS]([1-9][0-9]*)$/.exec(this);

  if (!parsed) {
    return false;
  }

  let mx = parsed[1] % 10;
  let my = parsed[2] % 10;

  let distFromCenterChebyshev = Math.max(Math.abs(5 - mx), Math.abs(5 - my));

  return distFromCenterChebyshev < 2;

}

String.prototype.isHighway = function() {
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
    return !!(parsed && ((parsed[1] % 10 === 0) || (parsed[2] % 10 === 0)));
}

String.prototype.isHighwayIntersection = function() {
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
  return !!(parsed && ((parsed[1] % 10 === 0) && (parsed[2] % 10 === 0)));
}

String.prototype.isSectorCenter = function() {
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
  return !!(parsed && ((parsed[1] % 10 === 5) && (parsed[2] % 10 === 5)));
}

String.prototype.isSkLair = function() {
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
  if (!parsed) return false;
  let dx = Math.abs(parsed[1] % 10 - 5);
  let dy = Math.abs(parsed[2] % 10 - 5);
  return dx < 2 && dy < 2 && dx + dy > 0;
}

String.prototype.isSectorEdge = function() {
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
  if (!parsed) return false;
  let dx = Math.abs(parsed[1] % 10 - 5);
  let dy = Math.abs(parsed[2] % 10 - 5);
  return dx == 4 || dy == 4;
}

String.prototype.isValidRoomName = function() {
  let worldSize = Game.map.getWorldSize() / 2;
  let parsed = /^[WE]([1-9]?[0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);
  return !!(parsed && parsed[1] < worldSize && parsed[2] < worldSize);
}

String.prototype.hasController = function() {
  let parsed = /^[WE]([0-9]*)[NS]([1-9]?[0-9]*)$/.exec(this);

  if (!parsed) {
    return false;
  }

  let mx = parsed[1] % 10;
  let my = parsed[2] % 10;

  let distFromCenterChebyshev = Math.max(Math.abs(5 - mx), Math.abs(5 - my));

  return distFromCenterChebyshev > 1 && distFromCenterChebyshev < 5;
}

String.prototype.toRole = function() {
  return /[A-Za-z]*/.exec(this.toLowerCase());
}

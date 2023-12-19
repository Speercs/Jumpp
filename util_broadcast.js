'use strict';


// A property of the game that really ought to be a system constant.
const MAX_ACTIVE_SEGMENTS = 10;

// Index of the segment on which the sender(s) will be listening.
const BROADCAST_SEGMENT = 87;

// Repeat error messages at most every this many ticks.
const ERROR_FREQUENCY = 1000;

// Leave requests in the queue at least this many ticks. This gives the listener some time to pick
// up the request. We get no feedback about whether they've heard it or not, so we want to leave
// plenty of time.
const REQUEST_DURATION = 100;

// Clean up stale requests every time a new request is made, and also at at least this frequency.
const CLEANUP_FREQUENCY = 1000;

// Error types.
const LOCAL_ERROR_TOO_MANY_SEGMENTS = "too_many_segments";

let errorTimes = {};

function complain(errorType) {
  if (errorTimes[errorType] + ERROR_FREQUENCY > Game.time) return;

  console.log(`Broadcast error: ${errorType}`);
  errorTimes[errorType] = Game.time;
}

function update() {
  try {
    updateImpl();
  } catch (err) {
    console.log(`broadcast.update error: ${err}`);
  }
}

function setup() {
  if (!Memory.broadcastSegment) Memory.broadcastSegment = {requests:[]};
  if (!Memory.broadcastSegment.requests) Memory.broadcastSegment.requests = [];
}

function cleanup() {
  Memory.broadcastSegment.requests =
      _.filter(Memory.broadcastSegment.requests, r => r.timestamp + REQUEST_DURATION > Game.time);
}

function updateImpl() {
  setup();
  if (Game.time % CLEANUP_FREQUENCY == 0) cleanup();

  if (!RawMemory.segments[BROADCAST_SEGMENT]) {
    let activeSegments = _.keys(RawMemory.segments);
    if (activeSegments.length >= MAX_ACTIVE_SEGMENTS) {
      complain(LOCAL_ERROR_TOO_MANY_SEGMENTS);
      return;
    }
    RawMemory.setActiveSegments(_.union(activeSegments, [BROADCAST_SEGMENT]));
    return;
  }

  // Note: There's no way to know which segments are currently set public. So this'll stomp any
  // such settings elsewhere.
  RawMemory.setPublicSegments([BROADCAST_SEGMENT]);

  RawMemory.segments[BROADCAST_SEGMENT] = JSON.stringify(Memory.broadcastSegment);
}

function request(resourceType, amount, sourceRoom, roomName) {
  setup();
  cleanup();

  let timestamp = Game.time;
  Memory.broadcastSegment.requests.push({resourceType, amount, sourceRoom, roomName, timestamp});

  return OK;
}

global.broadcastRequest = function(resourceType, amount, roomName) {
  return request(resourceType, amount, undefined, roomName);
}

global.broadcastRequestFrom = function(resourceType, amount, sourceRoom, roomName) {
  return request(resourceType, amount, sourceRoom, roomName);
}

module.exports = {
  update,
  request,
};

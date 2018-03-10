const http = require('http');
const socketio = require('socket.io');
const fs = require('fs');

const xxh = require('xxhashjs');

const PORT = process.env.PORT || process.env.NODE_PORT || 3004;

const handler = (request, response) => {
  /** read our file ASYNCHRONOUSLY from the file system. This is much
  lower performance, but allows us to reload the page changes during
    development. First parameter is the file to read, second is the
    callback to run when it's read ASYNCHRONOUSLY * */
  fs.readFile(`${__dirname}/../client/index.html`, (err, data) => {
    // if err, throw it for now
    if (err) {
      throw err;
    }
    response.writeHead(200);
    response.end(data);
  });
};

// start http server and get HTTP server instance
const app = http.createServer(handler);
/**
  pass http server instance into socketio to get
  a websocket server instance running inside our
  http server. We do this so socket.io can host
  the client-side script that we import in the browser
  and so it runs on the same port/address as our HTTP server.

  DON'T PASS THE HTTP MODULE itself.
* */
const io = socketio(app);

// start listening
app.listen(PORT);

// object to hold all square info for gravity
const squares = {};

// for each new socket connection
io.on('connection', (sock) => {
  const socket = sock;
  // joining into hard-coded room for this app
  // app users in room1
  socket.join('room1');

  // spawn different squares in at different X values
  const xPosition = Math.floor((Math.random() * 400) + 50);

  // random color
  const letters = '0123456789ABCDEF';
  let randColor = '#';
  // give the designated random color server side
  for (let i = 0; i < 6; i++) {
    randColor += letters[Math.floor(Math.random() * 16)];
  }

  socket.square = {
    hash: xxh.h32(`${socket.id}${Date.now()}`, 0xDEADBEEF).toString(16),
    lastUpdate: new Date().getTime(), // last time this object was updated
    x: xPosition, // default x value of this square
    y: 0, // default y value of this square
    prevX: 0, // default x value of the last known position
    prevY: 0, // default y value of the last known position
    destX: xPosition, // default x value of the desired next x position
    destY: 0, // default y value of the desired next y position
    alpha: 0, // default alpha (how far this object is % from prev to dest)
    height: 100, // default height
    width: 100, // default width
    color: randColor, //random color to distinguish users' squares
  };

  // send the user a joined event sending them their new square.
  // This square object on exists server side. Properties of the socket
  // are not the same on both the client and server.
  socket.emit('joined', socket.square);

  // add square to squares
  squares[socket.square.hash] = socket.square;

  const checkGravity = (data) => {
    // check if this is the lowest the square can fall
    if (data.destY <= 400) {
      const gravity = data.destY + 4;
      socket.square.destY = gravity;
      socket.square.lastUpdate = new Date().getTime();
      io.sockets.in('room1').emit('updatedMovement', socket.square);
    }
  };

  // when we receive a movement update from the client
  socket.on('movementUpdate', (data) => {
    // currently data will be the entire square object from the client
    // We really want to avoid that if possible, but it will work for
    // this example. So data is the entire object.
    // Additionally we are not validating any data. Any invalid data
    // could break our server/clients (if x position is a jpeg for example)
    // We are blindly trusting the data for now and overriding this
    // socket's square with the client's square
    socket.square = data;

    // change square data in the squares object
    squares[socket.square.hash] = socket.square;

    checkGravity(socket.square);

    // we do update the time though, so we know the last time this is updated
    socket.square.lastUpdate = new Date().getTime();

    socket.broadcast.to('room1').emit('updatedMovement', socket.square);

    // If we as the server want to forcefully override a person's screen
    // (resetting their position on their screen) because of collision
    // or something, we can do that. Sometimes a user might lag or not
    // have accurate info so they will seem up to date on their screen
    // but we need to rubber-band them back to a valid position.
    // socket.emit('updatedMovement', socket.square);
  });

  // when a user disconnects, we want to make sure we let everyone know
  // and ask them to remove the object
  socket.on('disconnect', () => {
    // ask users to remove the extra object on their side by sending the object id
    io.sockets.in('room1').emit('left', socket.square.hash);

    delete squares[socket.square.hash];

    // remove this socket from the room
    socket.leave('room1');
  });
});

console.log(`listening on port ${PORT}`);

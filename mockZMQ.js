/* eslint-disable */
const ZMQ_ENDPOINT = "tcp://127.0.0.1:5556";
const ZMQ_SEND_INTERVAL = 1000 / 600;
const TANGLE_WIDTH = 40;

const zmq = require("zeromq"),
  sock = zmq.socket("pub");

sock.bindSync(ZMQ_ENDPOINT);
console.log("creating ZMQ endpoint: ", ZMQ_ENDPOINT);

let hashRb = [],
  rbPointer = 0;

for (let i = 0; i < TANGLE_WIDTH; i++) {
  hashRb.push(Math.random());
}

setInterval(() => {
  let hash = Date.now(),
    address = "$addr$",
    value = Math.floor(Math.random() * 10),
    timestamp = Date.now(),
    current_index = 1,
    last_index = 0,
    bundle_hash = "$bundle_hash$",
    transaction_branch = hashRb[Math.floor(Math.random() * TANGLE_WIDTH)],
    transaction_trunk = hashRb[Math.floor(Math.random() * TANGLE_WIDTH)],
    tag = "$tag$";

    if(Math.random()<0.2){
        transaction_branch = Date.now() - 1000/ZMQ_SEND_INTERVAL
    }
  rbPointer = ++rbPointer % TANGLE_WIDTH;
  hashRb[rbPointer] = hash;

  elements = [];

  elements[0] = "tx";
  elements[1] = hash;
  elements[2] = address;
  elements[3] = value;
  elements[4] = "$obsolete_tag$";
  elements[5] = timestamp;
  elements[6] = current_index;
  elements[7] = last_index;
  elements[8] = bundle_hash;
  elements[9] = transaction_trunk;
  elements[10] = transaction_branch;
  elements[11] = "$arrival_time$";
  elements[12] = tag;

  const message = elements.join(" ");
//   console.log(message);
  sock.send(message);
}, ZMQ_SEND_INTERVAL);

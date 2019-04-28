# IOTA Tangle Visualiser 🦔

[![Codacy Badge](https://img.shields.io/codacy/grade/6329c35e70164a69bf4ee7ce844b1ff2.svg)](https://app.codacy.com/app/glumb/IOTAtangle?utm_source=github.com&utm_medium=referral&utm_content=glumb/IOTAtangle&utm_campaign=Badge_Grade_Dashboard)
![Codacy Badge](https://img.shields.io/badge/IOTA-100%25-94c63b.svg)

Live Visualisation of the IOTA Tangle using a dynamically layouted graph.
Demo: [http://tangle.glumb.de](http://tangle.glumb.de)

![IOTA TAngle](https://user-images.githubusercontent.com/3062564/56504720-bcf0db80-6519-11e9-898a-050709804887.png)

## Usage and UI

All circles represent transactions (tx) in the IOTA Tangle.
A circular buffer is used to populate the viewer with the last 1800 (configurable) tx on page load.

Hover a tx to see more details:

- bottom left: value, tag, hash
- top left: how many tx are confirming the selcted one (yellow)
- top left: how many tx are confirmed by the selcted one (magenta)
- tx of the same bundle are highlightes in blue

Use the input boxes on the left to filter by hast, tag or bundle. The tag filter is applied using a regex.

Toggle switches on the top right:

| config                | description                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| remove floating tx    | some tx are not visually attached to the tangle since their attachement point lays so far back that it is not displayed anymore. Automatic removal of those tx increases performance |
| limit to 4k tx        | for continuous use only 4000 tx are kept on screen. Older tx are deleted first.                                                                                                      |
| pin old tx            | pinning old tx increases performance by disabling their physics ad thus excluding them from the layouting process                                                                    |
| reduce moevement      | spawns new nodes close to their neighbours                                                                                                                                           |
| size by # of confirms | tx that have been confirmed by more tx have a bigger diameter                                                                                                                        |
| size by weight        | tx that confirm more tx have a bigger diameter                                                                                                                                       |
| size by value         | size based on transferred iota value                                                                                                                                                 |
| color by order        | color ty based on the order they appear on screen. Continuous hue rotation                                                                                                           |

### Configuration

In adition to setting configuration parameters using the ui, URL parameters can be used for presets.

**Example:**
`http://tangle.glumb.de/?DARK_MODE=true&CIRCLE_SIZE=40&HIGHLIGHT_COLOR_FORWARD="0xbada55ff"&svg`

**Syntax**
`http://tangle.glumb.de/?<CONFIG_PARAM_NAME>=<VALUE>[&<CONFIG_PARAM_NAME>=<VALUE>]`

**Available Configuration Parameters**

```json
CIRCLE_SIZE: 30, // size of a node
REMOVE_LONLY_AFTER_S: 30, // remove floating nodes after time
REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH: 0.03, // remove graphs that are smaller than % of all nodes
MAX_CIRCLE_SIZE: 80, // max node size used e.g. for 'size by value'
MAX_NODES: 4000, // max nodes when 'limit to 4k nodes' is enabled

// options
REMOVE_FLOATING_NODES: true,
COLOR_BY_DEPTH: false,
SIZE_BY_VALUE: false, // size based on transferred iota value
SIZE_BY_WEIGHT: false, // tx that confirm more tx have a bigger diameter
REMOVE_OLD_NODES: false, // only MAX_NODES tx are kept on screen. Older tx are deleted first.
PIN_OLD_NODES: true, // pinning old tx increases performance by disabling their physics ad thus excluding them from the layouting process
LIGHT_LINKS: false,
SPAWN_NODE_NEAR_FINAL_POSITION: true, // spawns new nodes close to their neighbours
COLOR_BY_NUMBER: false, // color ty based on the order they appear on screen. Continuous hue rotation
DARK_MODE: false,

// colors
HIGHLIGHT_MULTIPLE_COLOR: 0xda4b29, // for tags, hash, bundle filter
SAME_BUNDLE_COLOR: 0x1287ff,
LIGHT_LINK_COLOR: 0x222222ff,
LIGHT_NODE_COLOR: 0x000000ff,
LIGHT_NODE_BG_COLOR: 0xffffff,
HIGHLIGHT_COLOR_FORWARD: 0xf1b727ff,
HIGHLIGHT_COLOR_BACKWARD: 0xe23df4ff,
MILESTONE_COLOR: 0xe53d6f,
TIP_COLOR: 0x1fe0be,
```

**Additional Parameters**
Use `hash=<tx-hash>, bundle=<bundle-hash>, tag=<tx-tag>` to select a tx. Use with caution. The tx is only highlighted when on screen. Older tx are not queried.
Use `svg=true` to display a svg export utility button on the top left.

## Installation

Clone the repo and run `npm install`.

### Tangle Setup

The visualiser can be used for multiple networks (Mainnet, testnet, Customnet). The main entrypoint is the `<NAME>App.js` file.
To get started open the `mainnetApp.js` and configure the `ZMQ_ENDPOINT` and `LSM_NODE`.
Run `node mainnnetApp.js` to start the server. Done :)

To add another network, copy the `mainnetApp.js` and rename it to `<CustomName>App.js`. Copy the `mainnetdata.json` and also rename it to `<CustomName>data.json`.
Set your network endpoints in `<CustomName>App.js` and also set the `NAME` to `<CustomName>`.

## Architecture

The visualiser follows simple client server architecture. Server-side a ZMQ client is used for for data aquisition. It listens to the ZMQ Transaction stream of an IOTA Fullnode. An Instance of the IOTA JS library is used to peridically poll the latest milestone index.

Transactions are stroed in a ringbuffer to send the last 1800TX to the client on pageload.

![IOTA Tangle Glumb Architecture](https://user-images.githubusercontent.com/3062564/56865038-cb337180-69c9-11e9-9caa-4a7d26c18b14.png)

## Telegram / Message Format

The data send to the client via WebSocket follow this structure:

**TX - Transaction**

```js
{
  hash,
  address,
  value,
  tag,
  timestamp,
  current_index,
  last_index,
  bundle_hash,
  transaction_trunk,
  transaction_branch
}
```

**SN - Confirmed Transaction**

```js
{
  hash,
  address,
  transaction_trunk,
  transaction_branch,
  bundle
}
```

### Socket IO Client Events

The clients data interface is based on the SocketIO library. Therefore it is server agnostic as along as the expected SocketIO events are emittet by the backend.

On initialisation/pageload the following events are expected:

```js
socket.emit("config", FRONTEND_CONFIG); // { networkName }
socket.emit("inittx", txArray); // see format above
socket.emit("initsn", snArray); // see format above
socket.emit("initms", mileStoneArray); // Array of milestone tx hashes
```

During runtime the following event can be fired:

```js
socket.emit("tx", tx); // see format above
socket.emit("sn", sn); // see format above
socket.emit("ms", ms); // milestone tx hash
```

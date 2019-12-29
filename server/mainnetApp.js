const Tangle = require('./app.js')

const NAME = 'mainnet' // name used for data file NAMEdata.json
const LSM_NODE = 'https://<CHANGEME>:443' // latest solid milestone node. sed for getting coordinator tx
const ZMQ_ENDPOINT = 'tcp://<CHANGEME>:5556' // used to get a livestream of all tx
const WEB_PORT = 80 // port the webserver will listen on
const FRONTEND_CONFIG = {
    networkName: 'main net' // displayed in the frontend
}


Tangle(NAME, LSM_NODE, ZMQ_ENDPOINT, WEB_PORT, FRONTEND_CONFIG)

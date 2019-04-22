/* eslint-disable no-console */
const express = require('express')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server, {
    transports: ['websocket'],
})
const minify = require('express-minify')
const uglifyEs = require('uglify-es')
const sub = require('./sub.js')
const fs = require('fs')
const Deque = require('denque')
const IOTA = require('iota.lib.js')
const Cleanup = require('./cleanup')

module.exports = function initTangleViewer(NAME, LSM_NODE, ZMQ_ENDPOINT, WEB_PORT, FRONTEND_CONFIG) {


    const txQueue = new Deque()
    const snQueue = new Deque()
    const mileStoneQueue = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']

    let visitorCounter = 0
    let filesavedCounter = 0

    WEB_PORT = process.argv[2] || WEB_PORT
    const MAX_QUEUE_LENGTH = 1800


    // load data
    const data = JSON.parse(fs.readFileSync(NAME + 'data.json'))
    if (data) {
        console.log('loaded state from file')

        visitorCounter = data.visitorCounter
        filesavedCounter = data.filesavedCounter | 0
        filesavedCounter++

        console.log('filesavedCounter', filesavedCounter)

        for (const tx of data.tx)
            txQueue.push(tx)

        for (const sn of data.sn)
            snQueue.push(sn)

        for (const ms of data.ms) {
            mileStoneQueue.push(ms)
            mileStoneQueue.shift()
        }
    }


    Cleanup(() => {
        const data = {
            tx: txQueue.toArray(),
            sn: snQueue.toArray(),
            ms: mileStoneQueue,
            visitorCounter,
            filesavedCounter
        }
        console.log('saving state to file')
        fs.writeFileSync(NAME + 'data.json', JSON.stringify(data))
        console.log('state saved to file')
        process.exit()
    })

    console.log('listening on http://localhost:' + WEB_PORT)

    app.use(minify({
        cache: __dirname + '/' + NAME + 'cache',
        uglifyJsModule: uglifyEs,
    }))

    app.use(express.static(__dirname + '/webroot'))

    server.listen(WEB_PORT)

    const Sub = new sub(ZMQ_ENDPOINT)

    Sub.on('tx', function (tx) {
        console.log('tx', tx.hash)
        txQueue.push(tx)
        if (txQueue.length > MAX_QUEUE_LENGTH) txQueue.shift()
        io.sockets.emit('tx', tx)
    })


    Sub.on('sn', function (sn) {
        console.log('sn', sn.hash)
        snQueue.push(sn)
        if (snQueue.length > MAX_QUEUE_LENGTH) snQueue.shift()
        io.sockets.emit('sn', sn)
    })

    let connectedCount = 0

    io.on('connection', function (socket) {
        socket.emit('config', FRONTEND_CONFIG)
        socket.emit('inittx', txQueue.toArray())
        socket.emit('initsn', snQueue.toArray())
        socket.emit('initms', mileStoneQueue)
        connectedCount += 1
        visitorCounter++
        console.log('connectedCount: ', connectedCount)
        console.log('visitorCounter: ', visitorCounter)
        socket.on('disconnect', function () {
            connectedCount -= 1
            console.log('connectedCount: ', connectedCount)
        })
    })


    const iota = new IOTA({
        'provider': LSM_NODE
    })

    console.log('connecting to LSM node:', LSM_NODE)

    function requestMilestone() {
        iota.api.getNodeInfo(function (error, data) {
            if (error) {
                console.error(error)
            } else {
                if (mileStoneQueue.indexOf(data.latestMilestone) <= 0) {
                    console.log('Milestone tx: ' + data.latestMilestone)
                    io.sockets.emit('ms', data.latestMilestone)
                    mileStoneQueue.push(data.latestMilestone)
                    mileStoneQueue.shift()
                }
            }
            setTimeout(requestMilestone, 20 * 1000)
        })
    }
    requestMilestone()
}

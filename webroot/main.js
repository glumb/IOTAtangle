/* eslint-disable no-console */
/* eslint-env jquery */
/* global Viva,buildCircleNodeShader,WebglCircle,io */
$(document).ready(() => {
    // defaults

    const LOG = false

    const CONFIG = {
        // layout engine tuning
        SPRINGLENGTH: 10,
        SPRINGCOEFF: 0.0001,
        GRAVITY: -4,
        DRAGCOEFF: 0.02,
        TIMESTEP: 22,

        FORCE: {x:0,y:0.05},
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
        STATIC_FRONT: false, // spawn new nodes at one position and move tangle outwards

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
        LINK_COLOR: 0,
        NODE_COLOR: 0,
        NODE_BG_COLOR: 0,
    }

    const urlParams = new URLSearchParams(window.location.search)

    for (const parameter in CONFIG) {
        if (urlParams.has(parameter)) {
            const value = urlParams.get(parameter)
            CONFIG[parameter] = JSON.parse(value)
        }
    }

    CONFIG.LINK_COLOR = CONFIG.LIGHT_LINK_COLOR
    CONFIG.NODE_COLOR = CONFIG.LIGHT_NODE_COLOR
    CONFIG.NODE_BG_COLOR = CONFIG.LIGHT_NODE_BG_COLOR

    const socket = io.connect('/', {
        transports: ['websocket']
    })


    /**
     * VivaGraphJs wrapper
     */
    const VVG = ((Viva) => {
        const graph = Viva.Graph.graph()
        const graphics = Viva.Graph.View.webglGraphics()

        const layout = Viva.Graph.Layout.forceDirected(graph, {
            springLength: CONFIG.SPRINGLENGTH,
            springCoeff: CONFIG.SPRINGCOEFF,
            gravity: CONFIG.GRAVITY,
            dragCoeff: CONFIG.DRAGCOEFF,
            // dragCoeff: 0.02,
            // theta: 0.25,
            // theta: 0.8,default
            timeStep: CONFIG.TIMESTEP,
        })

        const renderer = Viva.Graph.View.renderer(graph, {
            container: document.getElementById('graph'),
            graphics: graphics,
            layout,
            // renderLinks : true,
            // prerender: 10000
        })

        const events = Viva.Graph.webglInputEvents(graphics, graph)

        const circleNode = buildCircleNodeShader()
        graphics.setNodeProgram(circleNode)
        // custom node shader
        graphics.node(() => {
            return new WebglCircle(10, 0x000000, 0, 0x000000)
        })

        renderer.run()

        return {
            graph,
            graphics,
            layout,
            renderer,
            events
        }
    })(Viva)


    /**
     *  Loading indicator
     */
    const Loading = (($) => {
        const $wrapper = $('.loader-wrapper')
        const $progress = $('.loader-wrapper .progress')

        function start() {
            $wrapper.show()
        }

        function stop() {
            $wrapper.hide()
            $progress.text('')
        }

        function progress(i, min = 0, max = 1) {
            if (i >= max) {
                $wrapper.hide()
                $progress.text('')
                return
            }

            $wrapper.show()
            $progress.text(`${(i / (max - min) * 100).toFixed(1)}%`)
        }

        return {
            start,
            stop,
            progress
        }
    })($)

    Loading.start()

    /**
     * Set of efficient graph iterators
     */
    const Iterators = ((VVG) => {

        // depth first (maybe a bit faster)
        function dfsDirectedIterator(node, cb, up, cbLinks = false, seenNodes = []) {
            const queue = [node]

            while (queue.length !== 0) {
                const node = queue.pop()
                // const node = queue.shift()
                seenNodes.push(node)

                if (cb(node)) return true

                const links = node.links
                for (let i = 0; i < links.length; i++) {
                    const link = links[i]
                    if (cbLinks) cbLinks(link)

                    if ((!up && link.toId === node.id) && seenNodes.indexOf(VVG.graph.getNode(link.fromId)) < 0) {
                        queue.push(VVG.graph.getNode(link.fromId))
                    } else if ((up && link.fromId === node.id) && seenNodes.indexOf(VVG.graph.getNode(link.toId)) < 0) {
                        queue.push(VVG.graph.getNode(link.toId))
                    }

                }
            }
        }

        // breadth first
        function bfsDirectedIterator(node, cb, up, cbLinks = false, seenNodes = []) {
            let pointer = 0
            seenNodes.push(node)

            while (seenNodes.length > pointer) {
                const node = seenNodes[pointer++]

                if (cb(node)) return true

                const links = node.links
                for (let i = 0; i < links.length; i++) {
                    const link = links[i]
                    if (cbLinks) cbLinks(link)

                    if ((!up && link.toId === node.id) && seenNodes.indexOf(VVG.graph.getNode(link.fromId)) < 0) {
                        seenNodes.push(VVG.graph.getNode(link.fromId))
                    } else if ((up && link.fromId === node.id) && seenNodes.indexOf(VVG.graph.getNode(link.toId)) < 0) {
                        seenNodes.push(VVG.graph.getNode(link.toId))
                    }

                }
            }
        }

        function bfsIterator(node, cb, cbLinks = false, seenNodes = []) {

            let pointer = 0
            seenNodes.push(node)

            while (seenNodes.length > pointer) {
                // const node = queue.pop()
                const node = seenNodes[pointer++]

                if (cb(node)) return true


                for (const link of node.links) {
                    if (cbLinks) cbLinks(link)

                    if (seenNodes.indexOf(VVG.graph.getNode(link.fromId)) < 0)
                        seenNodes.push(VVG.graph.getNode(link.fromId))

                    if (seenNodes.indexOf(VVG.graph.getNode(link.toId)) < 0)
                        seenNodes.push(VVG.graph.getNode(link.toId))

                }
            }
        }

        function iterateAllConnectedNodes(node, cb, cbLinks, seenNodes) {
            // VVG.graph.beginUpdate()
            bfsIterator(node, cb, cbLinks, seenNodes)
            // VVG.graph.endUpdate()
        }

        return {
            dfsDirectedIterator,
            bfsDirectedIterator,
            bfsIterator,
            iterateAllConnectedNodes
        }
    })(VVG)

    /**
     * Tangle stats
     */
    const Stats = (($, socket) => {

        const $nodeCounter = $('#node-counter')
        const $confirmedRatio = $('#confirmed-ratio')
        const $tipsRatio = $('#tips-ratio')
        const $tps = $('#tps')
        let confirmedTxCounter = 1
        let tipsCounter = 0
        let tpsCounter = 0


        socket.on('initms', () => { // should call after the first listener that actually adds the ms
            Graphs.iterateAllNodes((node) => {
                if (node.confirmed) confirmedTxCounter++
                if (node.tip) tipsCounter++
            })
        })

        socket.on('tx', () => {
            tpsCounter++
            tipsCounter += tipsCounter / VVG.graph.getNodesCount() - 0.01
            //estimation one new tx reduces the tx count by 1 if it connects to 2 tips, but by 0 if it connects to 2 non tips
            //so to not reducs the ratio with new tx
        })

        socket.on('ms', () => {
            confirmedTxCounter = 0
            tipsCounter = 0
            Graphs.iterateAllNodes((node) => {
                if (node.confirmed) confirmedTxCounter++
                if (node.tip) tipsCounter++
            })
        })

        setInterval(() => {
            $nodeCounter.text('transactions: ' + VVG.graph.getNodesCount())
            $confirmedRatio.text('confirmed ratio: ' + (confirmedTxCounter / VVG.graph.getNodesCount() * 100).toFixed(2) + '%')
            $tipsRatio.text('tips ratio: ' + (tipsCounter / VVG.graph.getNodesCount() * 100).toFixed(2) + '%')
        }, 500)

        const updateInterval = 2000
        const TPSFloatingMean = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        let tps = 0
        setInterval(() => {
            TPSFloatingMean.push(tpsCounter / updateInterval * 1000)
            TPSFloatingMean.shift()
            tps = TPSFloatingMean.reduce((p, c) => p + c, 0) / TPSFloatingMean.length
            $tps.text('(30s avg) tps: ' + (tps).toFixed(2))
            tpsCounter = 0
        }, updateInterval)

        return {
            get tps(){return tps}
        }
    })($, socket)

    /**
    * Handles manipulation of individual graphs
    * removal of small graphs/orphans
    */
    const Graphs = ((CONFIG, VVG, Iterators, Stats) => {
        const smallGraphsQueue = {}
        let nodeNumber = 0

        function addNode(nodeId, nodeNum) {
            nodeNumber = nodeNum
            // rmove some nodes from queue here
            if (CONFIG.REMOVE_FLOATING_NODES)
                for (const link of VVG.graph.getNode(nodeId).links) {
                    // if (smallGraphsQueue.hasOwnProperty(link.toId))
                    if (typeof smallGraphsQueue[link.toId] !== 'undefined')
                        delete smallGraphsQueue[link.toId]
                }

            smallGraphsQueue[nodeId] = Date.now()

            if (VVG.graph.getNodesCount() - 100 > CONFIG.MAX_NODES) {
                // is not in delete queue and is root of graph
                if (CONFIG.REMOVE_OLD_NODES)
                    removeOldNodes()
                if (CONFIG.PIN_OLD_NODES) // todo reorder this use lastpinnednode counter
                    pinOldNodes()
            }

            const links = VVG.graph.getNode(nodeId).links
            // if a linked node is in the del queu remove all from del queue
            if ((isInDeleteQueue(links[0].toId)) || (isInDeleteQueue(links[1].toId))) {
                Iterators.iterateAllConnectedNodes(VVG.graph.getNode(nodeId), (node) => {
                    if (deleteQueue.indexOf(node.id) >= 0)
                        deleteQueue.splice(deleteQueue.indexOf(node.id), 1)
                })
            }

        }

        function isInDeleteQueue(nodeId) {
            // maybe add an .toDelete flag to the object
            return deleteQueue.indexOf(nodeId) >= 0
        }

        // Concept: keep a list of all not connected graphs. Remove a graph when the last element has been added before REMOVE_LONLY_AFTER_S time.
        function removeSmallGraphs() {
            const numberOfNodes = VVG.graph.getNodesCount()
            // if the expected effort to calculate all mesh sizes for item in sGQ is larger than number of nodes, reduce the SGQ first O(n)
            if(LOG)console.log(Object.keys(smallGraphsQueue).length)
            if (Object.keys(smallGraphsQueue).length * CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH > 2) { //4/0.03=133 - give it some room to work with. queu gets automatically reduced
                updateGraphsList()
            }
            for (const nodeId in smallGraphsQueue) {

                // shortcut when just added
                if (Date.now() - smallGraphsQueue[nodeId] <= CONFIG.REMOVE_LONLY_AFTER_S * 1000)
                    continue

                // remove all redundant items from array (one per graph is enough)

                let lastTime = 0
                let lastTimeId = nodeId
                const nodes = []

                Iterators.iterateAllConnectedNodes(VVG.graph.getNode(nodeId), (node) => {
                    // if (smallGraphsQueue.hasOwnProperty(node.id)) { // remove the node from the queue
                    if (typeof smallGraphsQueue[node.id] !== 'undefined') { // remove the node from the queue
                        if (lastTime < smallGraphsQueue[node.id]) {
                            lastTimeId = node.id
                            lastTime = smallGraphsQueue[node.id]
                        }
                        delete smallGraphsQueue[node.id]
                    }
                    nodes.push(node)
                    return (nodes.length >= CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH * numberOfNodes)
                    // return (nodes.length >= CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH * numberOfNodes || now - lastTime < CONFIG.REMOVE_LONLY_AFTER_S * 1000)// remove the last part to shorten the nodes graph regularly
                })

                smallGraphsQueue[lastTimeId] = lastTime
                if (nodes.length < CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH * numberOfNodes &&
                    Date.now() - lastTime > CONFIG.REMOVE_LONLY_AFTER_S * 1000) {
                    if(LOG)console.log('mesh of size: ' + nodes.length + ' is smaller than ' + CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH * 100 + '% of the total node count: ' + CONFIG.REMOVE_SMALLER_THAN_PERCENTAGE_OF_TOTAL_MESH * numberOfNodes)

                    for (const node of nodes)
                        addToDeleteQueue(node.id)
                    // VVG.graph.removeNode(node.id)
                }
            }
            if(LOG)console.log(Object.keys(smallGraphsQueue).length)
        }

        const deleteQueue = []

        function addToDeleteQueue(nodeId) {
            if(Stats.tps > 100){ // performance optimisation
                VVG.graph.removeNode(nodeId)
                return
            }

            if (deleteQueue.indexOf(nodeId) < 0)
                deleteQueue.push(nodeId)

            if (deleteQueue.length == 1)
                processDeleteQueue()
        }

        const DELETE_QUEUE_INTERVAL = 50
        let deleteNodeCount = 0

        // to not delete bulks of nodes at once, a delete queue is used. It gradually removes nodes one at a time.
        function processDeleteQueue() {
            if (deleteQueue.length > 0) {
                if(LOG)console.log('delete queue len', deleteQueue.length)

                setTimeout(() => {
                    do {
                        const nodeToDelete = deleteQueue.shift()
                        const selectedNode = Selection.getSelectedNode()
                        if (nodeToDelete && (!selectedNode || nodeToDelete != selectedNode.id)) {
                            if (smallGraphsQueue[nodeToDelete]) { // todo change root here?
                                delete smallGraphsQueue[nodeToDelete]
                            }
                            //todo may kill performance
                            for (const link of VVG.graph.getNode(nodeToDelete).links) {
                                smallGraphsQueue[(link.toId == nodeToDelete) ? link.fromId : link.toId] = Date.now()
                            }

                            VVG.graph.removeNode(nodeToDelete)
                            deleteNodeCount++
                        } else {
                            if(LOG)console.log('not deleted')
                        }
                    } while (deleteQueue.length > 200)
                    processDeleteQueue()
                }, DELETE_QUEUE_INTERVAL)
            }
        }

        function updateGraphsList() {
            for (const nodeId in smallGraphsQueue) {
                // remove all redundant items from array (one per graph is enough)
                let lastTime = 0
                let lastTimeId = nodeId

                if(LOG)console.log('iter')

                Iterators.iterateAllConnectedNodes(VVG.graph.getNode(nodeId), (node) => {
                    // much faster than hasOwnProperty
                    if (typeof smallGraphsQueue[node.id] !== 'undefined') { // remove the node from the queue
                        if (lastTime < smallGraphsQueue[node.id]) { //make sure the root is always the newest node
                            lastTimeId = node.id
                            lastTime = smallGraphsQueue[node.id]
                        }
                        delete smallGraphsQueue[node.id]
                    }
                })
                smallGraphsQueue[lastTimeId] = lastTime
            }
        }

        function getNodePerGraph() {
            updateGraphsList() //todo update graph independent of removing items
            return smallGraphsQueue
        }

        function iterateAllNodes(cb = false, linkCb = false) {
            if (linkCb && !cb) {
                VVG.graph.forEachLink(linkCb)
            } else if (cb && !linkCb) {
                VVG.graph.forEachNode(cb)
            } else if (cb && linkCb) {
                const nodes = getNodePerGraph()
                for (const nodeId in nodes) {
                    Iterators.iterateAllConnectedNodes(VVG.graph.getNode(nodeId), cb, linkCb)
                }
            }
        }

        function removeOldNodes() {
            const count = VVG.graph.getNodesCount() - deleteQueue.length
            const toDeleteCount = count - CONFIG.MAX_NODES
            const maxNumberToDelete = nodeNumber - toDeleteCount

            let numberToDelete = toDeleteCount
            VVG.graph.forEachNode((node) => {
                if (node.number <= maxNumberToDelete) {
                    addToDeleteQueue(node.id)

                    if(LOG)console.log('removed node', node.id)
                    if (--numberToDelete <= 1) return true // break when deleted enough
                }

            })
        }

        function isDeleteQueueEmpty() {
            return deleteQueue.length == 0
        }

        let highestPinnedNumber = 0

        function pinOldNodes() {
            const delFraction = deleteNodeCount / nodeNumber
            const unpinnedNodes = (nodeNumber - highestPinnedNumber) * (1 - delFraction) //assume the deleted nodes are evenly distributed
            if (unpinnedNodes > CONFIG.MAX_NODES + 150) {
                const toPinCount = unpinnedNodes - CONFIG.MAX_NODES //2
                const maxNumberToPin = (highestPinnedNumber + toPinCount) * (1 + delFraction) //4
                let numberToPin = toPinCount
                VVG.graph.forEachNode((node) => {
                    if (node.number <= maxNumberToPin) {
                        VVG.layout.pinNode(node, true)
                        if (node.number > highestPinnedNumber) {
                            if(LOG)console.log('pinned node', node.id)
                            if (--numberToPin <= 1) {
                                if(LOG)console.log('breaking -----------')
                                return true // break when pinned enough
                            }
                        }
                    }
                })
                highestPinnedNumber = highestPinnedNumber + toPinCount
            }
        }

        function unpinOldNodes() {
            highestPinnedNumber = 0
            VVG.graph.forEachNode((node) => {
                VVG.layout.pinNode(node, false)
            })
        }

        return {
            addNode,
            removeSmallGraphs,
            getNodePerGraph,
            iterateAllNodes,
            isDeleteQueueEmpty,
            unpinOldNodes
        }
    })(CONFIG, VVG, Iterators, Stats)

    setInterval(() => {
        if (CONFIG.REMOVE_FLOATING_NODES)
            Graphs.removeSmallGraphs()
    }, 1000 * CONFIG.REMOVE_LONLY_AFTER_S)


    /**
   * Stores and applies Node styles
   */
    const Styles = ((Graphs) => {

        const filters = []
        let cacheDirty = false

        function clearCache() {
            cacheDirty = true
            update()
        }

        /**
        * Applies the specified filters for all nodes or one, if given.
        * Styles are only applied to all nodes after a filter change.
        * @param {VivaGraph.Node} node 
        */
        function update(node) {
            if (node) {
                for (const filter of filters) {
                    filter(node)
                }
            } else if (cacheDirty) {

                cacheDirty = false
                Graphs.iterateAllNodes((node) => {
                    for (const filter of filters) {
                        filter(node)
                    }
                })
            }
        }

        function add(filter) {
            cacheDirty = true

            filters.push(filter)
            update()
            return filter
        }

        function remove(filter) {
            cacheDirty = true
            filters.splice(filters.indexOf(filter), 1)
            update()
        }


        return {
            add,
            remove,
            update,
            clearCache
        }
    })(Graphs)


    /**
     * Applies base colors according to CONFIG
     */
    const Color = ((CONFIG, VVG) => {
        function colorNode(node) {
            const ui = VVG.graphics.getNodeUI(node.id)
            ui.border_color = CONFIG.NODE_COLOR >>> 8
            if (node.tip) {
                ui.color = CONFIG.TIP_COLOR
                ui.border_size = 0.6
            } else if (node.milestone) {
                ui.border_size = 0.6
                ui.color = CONFIG.MILESTONE_COLOR
            } else if (node.confirmed) {
                ui.border_size = 1
                ui.color = CONFIG.NODE_BG_COLOR
            } else {
                ui.border_size = 0.8
                ui.color = CONFIG.NODE_BG_COLOR
            }
        }

        function colorLink(link) {
            const ui = VVG.graphics.getLinkUI(link.id)
            ui.color = CONFIG.LINK_COLOR
        }
        return {
            colorNode,
            colorLink
        }
    })(CONFIG, VVG)

    Styles.add(Color.colorNode)
    Styles.add((node) => {
        const nodeUI = VVG.graphics.getNodeUI(node.id)
        nodeUI.size = CONFIG.CIRCLE_SIZE
    })


    /**
     * Formatting big numbers by addinf SI prefixes
     */
    const Format = (() => {

        const ranges = [{
            divider: 1e18,
            suffix: 'P'
        },
        {
            divider: 1e15,
            suffix: 'E'
        },
        {
            divider: 1e12,
            suffix: 'T'
        },
        {
            divider: 1e9,
            suffix: 'G'
        },
        {
            divider: 1e6,
            suffix: 'M'
        },
        {
            divider: 1e3,
            suffix: 'k'
        }
        ]

        function formatNumber(n) {
            for (let i = 0; i < ranges.length; i++) {
                if (Math.abs(n) >= ranges[i].divider) {
                    return (n / ranges[i].divider).toFixed(2) + ranges[i].suffix
                }
            }
            return n.toFixed(2)
        }

        return {
            formatNumber
        }
    })()


    /**
     * Highlights selected nodes and updates infoboxes
     */
    const Selection = ((VVG, Iterators, Format, $) => {
        let hoveredNode = null
        let selectedNode = null
        let activeNode = null


        function hasChildren(node) {
            let children = false
            VVG.graph.forEachLinkedNode(node.id, () => {

                children = true
                return true

            }, true)

            return children
        }

        function selectNodeAndChildren(node) {
            const nodeUI = VVG.graphics.getNodeUI(node.id)
            if (!nodeUI) return
            nodeUI.size = CONFIG.CIRCLE_SIZE * 1.6

            VVG.layout.pinNode(node, true)

            const seenNodesBackwards = [],
                seenNodesForward = [] // to get the nodes count
            recursivelyColor(node, CONFIG.HIGHLIGHT_COLOR_BACKWARD, CONFIG.HIGHLIGHT_COLOR_BACKWARD, true, seenNodesBackwards)
            recursivelyColor(node, CONFIG.HIGHLIGHT_COLOR_FORWARD, CONFIG.HIGHLIGHT_COLOR_FORWARD, false, seenNodesForward)

            if (!hasChildren(node))
                VVG.graphics.getNodeUI(node.id).border_color = CONFIG.HIGHLIGHT_COLOR_BACKWARD >>> 8

            return {
                seenNodesBackwards,
                seenNodesForward
            }
        }

        function deselectNodeAndChildren(node) {
            const nodeUI = VVG.graphics.getNodeUI(node.id)
            if (!nodeUI) return //node may heve been deleted while hovering
            nodeUI.border_color = CONFIG.NODE_COLOR >>> 8
            Styles.update(node)

            VVG.layout.pinNode(node, false)

            Iterators.dfsDirectedIterator(node, (node) => Styles.update(node), true, (link) => Color.colorLink(link))
            Iterators.dfsDirectedIterator(node, (node) => Styles.update(node), false, (link) => Color.colorLink(link))
        }

        function recursivelyColor(node, nodeColor, linkColor, backwards = false, seenNodes = []) {
            const nodeId = node.id
            const links = node.links
            // skip seen nodes
            if (seenNodes.indexOf(nodeId) >= 0) {
                return
            }
            seenNodes.push(nodeId)

            const nodeUI = VVG.graphics.getNodeUI(node.id)
            nodeUI.border_color = nodeColor >>> 8

            //same color when same bundle
            const bh = ((VVG.graph.getNode(seenNodes[0]) || {}).data || {}).bundle_hash
            if (bh && bh === ((node || {}).data || {}).bundle_hash)
                nodeUI.border_color = CONFIG.SAME_BUNDLE_COLOR


            for (let i = 0; i < links.length; i++) {
                const link = links[i]

                if (backwards && link.toId === nodeId) {
                    recursivelyColor(VVG.graph.getNode(link.fromId), nodeColor, linkColor, backwards, seenNodes)
                    const linkUI = VVG.graphics.getLinkUI(link.id)
                    linkUI.color = linkColor
                } else if (!backwards && link.fromId === nodeId) {
                    recursivelyColor(VVG.graph.getNode(link.toId), nodeColor, linkColor, backwards, seenNodes)
                    const linkUI = VVG.graphics.getLinkUI(link.id)
                    linkUI.color = linkColor
                }
            }
        }

        function selectNode(node) {
            if (selectedNode) deselectNodeAndChildren(selectedNode)
            if (hoveredNode) deselectNodeAndChildren(hoveredNode)

            if (node) {
                selectedNode = node
                activeNode = node
            } else {
                selectedNode = null
                activeNode = hoveredNode
            }
            updateActiveNodeSelection()
        }

        function hoverNode(node) {
            if (selectedNode) deselectNodeAndChildren(selectedNode)
            if (hoveredNode) deselectNodeAndChildren(hoveredNode)

            if (node) {
                hoveredNode = node
                activeNode = node
            } else {
                hoveredNode = null
                activeNode = selectedNode
            }
            updateActiveNodeSelection()
        }

        const $txInfo = $('#tx-info')
        const $confirmedByCount = $('#confirmed-by-count')
        const $confirmingCount = $('#confirming-count')

        function updateActiveNodeSelection() {
            if (activeNode) {
                const linkedNodes = selectNodeAndChildren(activeNode)

                if (typeof activeNode.data !== 'undefined') {
                    const node = Selection.getActiveNode()
                    $txInfo.html(
                        'value: ' + Format.formatNumber(+node.data.value) + 'i' + '<br>' +
                        'tx tag: ' + node.data.tag + '<br>' +
                        'tx hash: ' + node.data.hash + '<br>' +
                        'bundle hash (' + node.data.current_index + '|' + node.data.last_index + '): ' + node.data.bundle_hash + '<br>'
                    )
                }
                $confirmingCount.text(linkedNodes.seenNodesForward.length - 1)
                $confirmedByCount.text(linkedNodes.seenNodesBackwards.length - 1)
            } else {
                $txInfo.html('')
                $confirmingCount.text('')
                $confirmedByCount.text('')
            }

        }

        function getActiveNode() {
            return activeNode
        }

        function getSelectedNode() {
            return selectedNode
        }

        //#region Mouseevents

        let mouseOverNode = null
        VVG.events.mouseEnter(function (node) {
            document.body.style.cursor = 'pointer'
            hoverNode(node)
            mouseOverNode = node
        }).mouseLeave(function () {
            document.body.style.cursor = 'default'
            hoverNode()
            mouseOverNode = null
        })


        let isDragging = false
        $('canvas').mousedown(function () {
            isDragging = false
        })
            .mousemove(function () {
                isDragging = true
            })
            .mouseup(function () {
                const wasDragging = isDragging
                isDragging = false
                if(LOG)console.log(wasDragging)
                if (!wasDragging) {
                    selectNode(mouseOverNode)
                }
            })
        //#endregion

        return {
            selectNode,
            hoverNode,
            updateActiveNodeSelection,
            getActiveNode,
            getSelectedNode
        }
    })(VVG, Iterators, Format, $)


    /**
     * Positioning and scale 
     */
    const Viewport = ((VVG) => {
        function zoom(desiredScale, currentScale, tries) {
            tries = tries || 0
            if (tries > 30) return
            // zoom API in vivagraph 0.5.x is silly. There is no way to pass transform
            // directly. Maybe it will be fixed in future, for now this is the best I could do:
            if (Math.abs(desiredScale - currentScale) < 0.01) return

            if (desiredScale < currentScale) {
                currentScale = VVG.renderer.zoomOut()
                // setTimeout(function() {
                zoom(desiredScale, currentScale, ++tries)
                // }, 16);
            } else if (desiredScale > currentScale) {
                currentScale = VVG.renderer.zoomIn()
                // setTimeout(function() {
                zoom(desiredScale, currentScale, ++tries)
                // }, 16);
            }
        }

        function fit() {
            const graphRect = VVG.layout.getGraphRect()
            if(LOG)console.log(graphRect)
            const graphSize = Math.min(graphRect.x2 - graphRect.x1, graphRect.y2 - graphRect.y1)
            const screenSize = Math.min(document.body.clientWidth, document.body.clientHeight)

            const desiredScale = screenSize / graphSize

            if(LOG)console.log(desiredScale)
            VVG.renderer.moveTo(0, 0)
            zoom(desiredScale, VVG.renderer.zoomOut())
        }

        function moveTo(x, y) {
            VVG.renderer.moveTo(x, y)
        }

        return {
            zoom,
            fit,
            moveTo
        }
    })(VVG)

    $('body').keypress((e) => {
        if (event.ctrlKey && event.key === 'f') // the enter key code
        {
            e.preventDefault()
            Viewport.fit()
            return false
        }
    })

    Viewport.zoom(0.1, 1)


    /**
     * Selection of TX based on hash, bundle hash
     */
    const Filter = ((VVG, Selection, $, Viewport) => {

        function selectNodeByHash(hash) {
            $('#hash-input').val(hash)
            const nodeId = hash
            if (VVG.graph.getNode(nodeId)) {
                const pos = VVG.layout.getNodePosition(nodeId)
                Viewport.moveTo(pos.x, pos.y)
                Selection.selectNode(VVG.graph.getNode(nodeId))

                $('#hash-info').text('')
            } else {
                $('#hash-info').text('hash not found (yet)')
            }
        }

        $('#hash-input').keypress(function (e) {
            const key = e.which
            if (key == 13 || event.key === 'Enter') // the enter key code
            {
                e.preventDefault()
                selectNodeByHash($('#hash-input').val().trim())
                return false
            }
        })

        function highlightNode(node, color) {
            const nodeUI = VVG.graphics.getNodeUI(node.id)
            nodeUI.border_color = color
            nodeUI.size = CONFIG.CIRCLE_SIZE * 1.4
        }

        let tag_filter = false

        function selectNodesByTag(tag) {
            $('#tag-input').val(tag)

            if (tag_filter) {
                Styles.remove(tag_filter)
                tag_filter = false
            }
            const tagRegex = tag

            if (tagRegex.length == 0) return

            const R = new RegExp(tagRegex, 'i')
            tag_filter = Styles.add((node) => {
                if (node.data && node.data.tag.match(R)) {
                    highlightNode(node, CONFIG.HIGHLIGHT_MULTIPLE_COLOR)
                }
            })
        }
        $('#tag-input').keypress(function (e) {
            const key = e.which
            if (key == 13 || event.key === 'Enter') // the enter key code
            {
                e.preventDefault()
                selectNodesByTag($('#tag-input').val().trim())
                return false
            }
        })

        let bundle_hash_filter = false
        function selectNodesByBundle(bundle_hash) {
            if (bundle_hash_filter) {
                Styles.remove(bundle_hash_filter)
                bundle_hash_filter = false
            }

            if (bundle_hash.length == 0) return

            bundle_hash_filter = Styles.add((node) => {
                if (node.data && node.data.bundle_hash === bundle_hash) {
                    highlightNode(node, CONFIG.SAME_BUNDLE_COLOR)
                }
            })
        }

        $('#bundle-hash-input').keypress(function (e) {
            const key = e.which
            if (key == 13 || event.key === 'Enter') // the enter key code
            {
                e.preventDefault()

                const bundle_hash = $('#bundle-hash-input').val().trim()

                selectNodesByBundle(bundle_hash)
                return false
            }
        })

        return {
            selectNodeByHash,
            selectNodesByTag,
            selectNodesByBundle
        }
    })(VVG, Selection, $, Viewport)


    const ImageSVGExport = ((Graphs, VVG) => {

        return {
            init: () => {


                function getNode(n, v) {
                    n = document.createElementNS('http://www.w3.org/2000/svg', n)
                    for (const p in v)
                        n.setAttributeNS(null, p.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() }), v[p])
                    return n
                }

                function createSVG() {
                    function getGraphBoundingBox() {
                        const bbx = {
                            x1: Number.MAX_VALUE,
                            x2: Number.MIN_VALUE,
                            y1: Number.MAX_VALUE,
                            y2: Number.MIN_VALUE
                        }
                        Graphs.iterateAllNodes((n) => {
                            const pos = VVG.layout.getNodePosition(n.id)
                            if (pos.x > bbx.x2) bbx.x2 = pos.x
                            if (pos.x < bbx.x1) bbx.x1 = pos.x
                            if (pos.y > bbx.y2) bbx.y2 = pos.y
                            if (pos.y < bbx.y1) bbx.y1 = pos.y
                        })
                        return bbx
                    }
                    const bbx = getGraphBoundingBox()
                    const svg = getNode('svg', { width: bbx.x2, height: bbx.y2, viewBox: bbx.x1 + ' ' + bbx.y1 + ' ' + (bbx.x2 - bbx.x1) + ' ' + (bbx.y2 - bbx.y1) })

                    function addCircle(x, y, radius, stroke, color, strokeColor) {
                        const r = getNode('circle', { cx: x, cy: y, r: radius, strokeWidth: stroke * radius, fill: '#' + color.toString(16), stroke: '#' + strokeColor.toString(16) })
                        svg.appendChild(r)
                    }

                    function addLink(x1, y1, x2, y2, strokeWidth, strokeColor) {
                        const r = getNode('line', { x1, x2, y1, y2, strokeWidth, stroke: '#' + strokeColor.toString(16) })
                        svg.appendChild(r)
                    }

                    Graphs.iterateAllNodes(false, (link) => {
                        const pos = VVG.layout.getLinkPosition(link.id)
                        const ui = VVG.graphics.getLinkUI(link.id)
                        addLink(pos.from.x, pos.from.y, pos.to.x, pos.to.y, 3, ui.color >>> 8)
                    })

                    Graphs.iterateAllNodes((node) => {
                        const pos = VVG.layout.getNodePosition(node.id)
                        const nodeUI = VVG.graphics.getNodeUI(node.id)

                        addCircle(pos.x, pos.y, nodeUI.size * 0.45, nodeUI.border_size, nodeUI.color, nodeUI.border_color)
                    })


                    const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
                    const svgUrl = URL.createObjectURL(svgBlob)
                    const downloadLink = document.createElement('a')
                    downloadLink.href = svgUrl
                    downloadLink.download = 'tangle.svg'
                    document.body.appendChild(downloadLink)
                    downloadLink.click()
                    document.body.removeChild(downloadLink)

                }

                const $button = $(`<button style="
                                    position: fixed;
                                    top: 10px;
                                    left: 10px;
                                    ">capture SVG</button>`
                ).on('click', () => {
                    createSVG()
                })

                $('body').append($button)
            }
        }
    })(Graphs, VVG)


    const UrlParams = ((Filter, ImageSVGExport) => {

        //#region HANDLE URL PARAMETERS

        function initAfterNodesAdded() {

            if (urlParams.has('hash')) {
                Filter.selectNodeByHash(urlParams.get('hash'))
            } else if (urlParams.has('tag')) {
                Filter.selectNodesByTag(urlParams.get('tag'))
            } else if (urlParams.has('bundle')) {
                Filter.selectNodesByBundle(urlParams.get('bundle'))
            }

            if (urlParams.has('tool')) {
                const script = document.createElement('script')
                script.src = urlParams.get('tool') + '.js'
                document.head.appendChild(script)
            }
            if (urlParams.has('clean')) {
                $('div').not('#graph').hide()
            }
            if (urlParams.has('svg')) {
                ImageSVGExport.init()
            }
        }
        //#endregion


        return {
            initAfterNodesAdded
        }
    })(Filter, ImageSVGExport)

    /**
     * Main networking and node handling
     */
    const App = ((VVG, socket, Color, Styles, Graphs, Iterators, UrlParams, Loading) => {
        let nodeNumber = 0
        let pinnedNodesqueue = [null,null,null,null,null,null,null,null,null,null]
        let pinnedNodesPointer = 0

        function addNode(data) {

            // if(LOG)console.log(data)
            let tip = true
            const existingNode = VVG.graph.getNode(data.hash)
            if (existingNode) {
                for (const link of VVG.graph.getNode(data.hash).links) {
                    if (link.fromId === data.hash) {
                        tip = false
                        break
                    }
                }
            }
            if (CONFIG.SPAWN_NODE_NEAR_FINAL_POSITION)
                VVG.graph.beginUpdate()

            const node = VVG.graph.addNode(data.hash, data, (CONFIG.STATIC_FRONT)?{x:Math.random()*100,y:Math.random()*100}:undefined)
            if(!node.number && CONFIG.STATIC_FRONT){ //no number => new node
                VVG.layout.pinNode(node, true)
                pinnedNodesqueue[pinnedNodesPointer] = node
                pinnedNodesPointer = (++pinnedNodesPointer)%10

                if(pinnedNodesqueue[pinnedNodesPointer])
                    VVG.layout.pinNode(pinnedNodesqueue[pinnedNodesPointer], false)
            }
            
            node.tip = tip
            node.number = node.number || ++nodeNumber //increment number only if not exists

            VVG.graph.addLink(data.transaction_branch, data.hash)
            VVG.graph.addLink(data.transaction_trunk, data.hash)


            const transactionBranchNode = VVG.graph.getNode(data.transaction_branch)
            transactionBranchNode.tip = false
            transactionBranchNode.number = transactionBranchNode.number || ++nodeNumber

            const transactionTrunkNode = VVG.graph.getNode(data.transaction_trunk)
            transactionTrunkNode.tip = false
            transactionTrunkNode.number = transactionTrunkNode.number || ++nodeNumber

            if (CONFIG.SPAWN_NODE_NEAR_FINAL_POSITION)
                VVG.graph.endUpdate()

            for (const link of node.links) {
                Color.colorLink(link)
            }
            Styles.update(node)
            Styles.update(transactionBranchNode)
            Styles.update(transactionTrunkNode)

            Graphs.addNode(data.hash, nodeNumber)

        }

        function processNewMilestone(nodeId) {
            const ui = VVG.graphics.getNodeUI(nodeId)
            if (ui) {
                Iterators.dfsDirectedIterator(VVG.graph.getNode(nodeId), (node) => {
                    processNewConfirmed(node.id)
                }, false)
                const node = VVG.graph.getNode(nodeId)
                if (node) {
                    node.milestone = true
                    if(LOG)console.log('ms found', ui)
                    Styles.update(node)
                }
            }
        }

        function processNewConfirmed(nodeId) {
            const node = VVG.graph.getNode(nodeId)
            if (node) {
                node.confirmed = true
                // if(LOG)console.log('sn found', ui)
                Styles.update(node)
            }
        }

        //#region Network

        socket.on('tx', (data) => {
            addNode(data)
        })

        socket.on('sn', (data) => {
            processNewConfirmed(data.hash)
        })

        socket.on('ms', (ms) => {
            processNewMilestone(ms)
        })

        socket.on('inittx', (nodes) => {
            let i = 0
            // VVG.graph.beginUpdate(); // causes ui to not be initiated
            for (const node of nodes) {
                Loading.progress(++i, 0, nodes.length)
                addNode(node)
            }
            // VVG.graph.endUpdate();
            Loading.stop()
            UrlParams.initAfterNodesAdded()
        })

        socket.on('initsn', (nodes) => {
            for (const node of nodes) {
                processNewConfirmed(node.hash)
            }
        })

        socket.on('initms', (milestones) => {
            for (const ms of milestones) {
                processNewMilestone(ms)
            }
        })

        //#endregion
    })(VVG, socket, Color, Styles, Graphs, Iterators, UrlParams, Loading)

    setInterval(() => {
        // check for new children to color
        Selection.updateActiveNodeSelection()
        Styles.update()
    }, 3000)

    // eslint-disable-next-line no-unused-vars
    function getGraphBoundingBox(node) {
        const bbx = {
            x1: Number.MAX_VALUE,
            x2: Number.MIN_VALUE,
            y1: Number.MAX_VALUE,
            y2: Number.MIN_VALUE
        }
        Iterators.iterateAllConnectedNodes(node, (n) => {
            const pos = VVG.layout.getNodePosition(n.id)
            if (pos.x > bbx.x2) bbx.x2 = pos.x
            if (pos.x < bbx.x1) bbx.x1 = pos.x
            if (pos.y > bbx.y2) bbx.y2 = pos.x
            if (pos.y < bbx.y1) bbx.y1 = pos.x
        })
        return bbx
    }


    /**
     * View and graph options
     */
    const Options = ((CONFIG, Iterators) => {

        function calculateConfirms(node, confirms, mode) {
            let c = 0
            Iterators.dfsDirectedIterator(node, () => {
                c++
            }, mode)
            confirms[node.id] = c
        }

        let size_filter = false
        $('#SIZE_BY_DEPTH').change(function () {
            $('#SIZE_BY_VALUE').prop('checked', false)
            $('#SIZE_BY_WEIGHT').prop('checked', false)

            CONFIG.COLOR_BY_DEPTH = !!this.checked

            if (size_filter) {
                Styles.remove(size_filter)
                size_filter = false
            }

            if (CONFIG.COLOR_BY_DEPTH) {
                const confirms = {}

                Graphs.iterateAllNodes((node) => {
                    calculateConfirms(node, confirms, true)
                })

                size_filter = Styles.add((node) => {

                    if (!confirms.hasOwnProperty(node.id))
                        calculateConfirms(node, confirms, true)

                    const nodeUI = VVG.graphics.getNodeUI(node.id)
                    nodeUI.size = 10 + (confirms[node.id] / VVG.graph.getNodesCount()) * 80

                })
            }
        })

        $('#SIZE_BY_WEIGHT').change(function () {
            $('#SIZE_BY_VALUE').prop('checked', false)
            $('#SIZE_BY_DEPTH').prop('checked', false)
            CONFIG.COLOR_BY_WEIGHT = !!this.checked

            if (size_filter) {
                Styles.remove(size_filter)
                size_filter = false
            }

            if (CONFIG.COLOR_BY_WEIGHT) {
                const confirms = {}

                Graphs.iterateAllNodes((node) => {
                    calculateConfirms(node, confirms, false)
                })

                size_filter = Styles.add((node) => {

                    if (!confirms.hasOwnProperty(node.id))
                        calculateConfirms(node, confirms, false)

                    const nodeUI = VVG.graphics.getNodeUI(node.id)
                    nodeUI.size = 10 + (confirms[node.id] / VVG.graph.getNodesCount()) * 80

                })
            }
        })

        $('#SIZE_BY_VALUE').change(function () {
            $('#SIZE_BY_DEPTH').prop('checked', false)
            $('#SIZE_BY_WEIGHT').prop('checked', false)
            CONFIG.SIZE_BY_VALUE = !!this.checked

            if (size_filter) {
                Styles.remove(size_filter)
                size_filter = false
            }

            if (CONFIG.SIZE_BY_VALUE) {
                let maxVal = 0
                Graphs.iterateAllNodes((node) => {
                    if (node.data && node.data.value && +node.data.value > maxVal) maxVal = +node.data.value
                })
                if(LOG)console.log('maxval', maxVal)
                size_filter = Styles.add((node) => {
                    if (node.data && node.data.value && node.data.value > maxVal) Styles.clearCache()

                    // if(LOG)console.log('size', (node.data && node.data.value) ? 1 + (CONFIG.CIRCLE_SIZE *  node.data.value/maxVal): 1)
                    const nodeUI = VVG.graphics.getNodeUI(node.id)
                    nodeUI.size = (node.data && node.data.value) ? 1 + (Math.sqrt(1 + Math.abs(+node.data.value) / maxVal * CONFIG.CIRCLE_SIZE * CONFIG.CIRCLE_SIZE)) : 1
                })
            }
        })

        function hslToHex(h, s, l) {
            h /= 360
            s /= 100
            l /= 100
            let r, g, b
            if (s === 0) {
                r = g = b = l // achromatic
            } else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1
                    if (t > 1) t -= 1
                    if (t < 1 / 6) return p + (q - p) * 6 * t
                    if (t < 1 / 2) return q
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
                    return p
                }

                const q = l < 0.5 ? l * (1 + s) : l + s - l * s
                const p = 2 * l - q
                r = hue2rgb(p, q, h + 1 / 3)
                g = hue2rgb(p, q, h)
                b = hue2rgb(p, q, h - 1 / 3)
            }
            r = ~~(255 * r) // to int ~~
            g = ~~(255 * g) // to int ~~
            b = ~~(255 * b) // to int ~~

            return b | (g << 8) | (r << 16)
        }

        let color_by_number_filter = false
        $('#COLOR_BY_NUMBER').change(function () {
            CONFIG.COLOR_BY_NUMBER = !!this.checked

            if (color_by_number_filter) {
                Styles.remove(color_by_number_filter)
                color_by_number_filter = false
            }

            if (CONFIG.COLOR_BY_NUMBER) {
                color_by_number_filter = Styles.add((node) => {
                    const nodeUI = VVG.graphics.getNodeUI(node.id)
                    nodeUI.border_color = hslToHex((node.number % 3600) / 10, 80, 50)
                })
            }
        })

        $('#REMOVE_FLOATING_NODES').change(function () {
            CONFIG.REMOVE_FLOATING_NODES = !!this.checked
        })
        $('#PIN_OLD_NODES').change(function () {
            CONFIG.PIN_OLD_NODES = !!this.checked
            if (!CONFIG.PIN_OLD_NODES) Graphs.unpinOldNodes()
        })
        $('#REMOVE_OLD_NODES').change(function () {
            CONFIG.REMOVE_OLD_NODES = !!this.checked
        })
        $('#SPAWN_NODE_NEAR_FINAL_POSITION').change(function () {
            CONFIG.SPAWN_NODE_NEAR_FINAL_POSITION = !!this.checked
        })
        $('#LIGHT_LINKS').change(function () {
            CONFIG.LIGHT_LINKS = !!this.checked
            CONFIG.LINK_COLOR = (CONFIG.LIGHT_LINKS) ? 0xaaaaaaff : (CONFIG.DARK_MODE) ? 0xeeeeeeff : CONFIG.LIGHT_LINK_COLOR
            Graphs.iterateAllNodes(false, (link) => Color.colorLink(link))
            // Graphs.iterateAllNodes((node) => Color.colorNode(node), (link) => Color.colorLink(link))
        })
        $('#DARK_MODE').change(function () {
            CONFIG.DARK_MODE = !!this.checked
            CONFIG.LINK_COLOR = (CONFIG.DARK_MODE) ? 0xeeeeeeff : CONFIG.LIGHT_LINK_COLOR
            CONFIG.NODE_COLOR = (CONFIG.DARK_MODE) ? 0xeeeeeeff : CONFIG.LIGHT_NODE_COLOR
            CONFIG.NODE_BG_COLOR = (CONFIG.DARK_MODE) ? 0x333333 : CONFIG.LIGHT_NODE_BG_COLOR
            Graphs.iterateAllNodes(false, (link) => Color.colorLink(link))
            Styles.clearCache()
            $('body').toggleClass('dark-mode', CONFIG.DARK_MODE)
        })
        $('#STATIC_FRONT').change(function () {
            CONFIG.STATIC_FRONT = !!this.checked
            if(CONFIG.STATIC_FRONT){
                VVG.layout.setForce(CONFIG.FORCE)
            }else{
                VVG.layout.setForce({x:0,y:0})
            }
            $('body').toggleClass('dark-mode', CONFIG.DARK_MODE)
        })

        function updateParameter(key, value) {
            if (CONFIG.hasOwnProperty(key)) {
                CONFIG[key] = value
                if ($(`#${key}`).length) {
                    $(`#${key}`).prop('checked', value)
                    $(`#${key}`).change()
                }
            }
        }

        // set default config
        for (const key in CONFIG) {
            if (CONFIG.hasOwnProperty(key)) {
                const config = CONFIG[key]
                updateParameter(key, config)
            }
        }

        return { updateParameter }
    })(CONFIG, Iterators)


    socket.on('config', (config) => {
        $('#network').text(config.networkName)
    })


})

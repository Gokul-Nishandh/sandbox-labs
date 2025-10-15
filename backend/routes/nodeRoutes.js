const express = require('express');
const router = express.Router();
const nodeController = require('../controllers/nodeController');

router.get('/', nodeController.listNodes);
router.post('/', nodeController.createNode);
router.post('/:id/run', nodeController.runNode);
router.post('/:id/stop', nodeController.stopNode);
router.post('/:id/wipe', nodeController.wipeNode);
router.post('/wipeAll',nodeController.wipeAllNodes);

module.exports = router;

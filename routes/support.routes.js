const router = require("express").Router();
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const authorize = require("../middleware/role");
const supportController = require("../controllers/support.controller");
const { createTicketSchema, ticketMessageSchema } = require("../validations/support.validation");

router.use(authenticate);

router.get("/tickets", supportController.getMyTickets);
router.post("/tickets", validate(createTicketSchema), supportController.createTicket);
router.get("/tickets/:id", supportController.getTicketDetails);
router.patch("/tickets/:id", supportController.updateTicket);
router.patch("/tickets/:id/close", supportController.closeTicket);
router.delete("/tickets/:id", supportController.deleteTicket);
router.get("/tickets/:id/messages", supportController.getTicketMessages);
router.post("/tickets/:id/messages", validate(ticketMessageSchema), supportController.addTicketMessage);

module.exports = router;

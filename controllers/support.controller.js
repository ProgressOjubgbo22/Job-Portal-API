const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const { getPaginationOptions } = require("../utils/pagination");
const { v4: uuidv4 } = require("uuid");

// GET /api/support/tickets
const getMyTickets = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id, isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.category) filter.category = req.query.category;

  const { page, limit } = getPaginationOptions(req.query, { updatedAt: -1 });
  const result = await SupportTicket.paginate(filter, { page, limit, sort: { updatedAt: -1 } });

  return new ApiResponse(200, result).send(res);
});

// POST /api/support/tickets
const createTicket = asyncHandler(async (req, res) => {
  const { subject, category, description, priority } = req.body;

  const ticket = await SupportTicket.create({
    user: req.user._id,
    ticketNumber: `TCK-${uuidv4().split("-")[0].toUpperCase()}`,
    subject,
    category,
    description,
    priority,
    status: "open",
  });

  await SupportMessage.create({
    ticket: ticket._id,
    sender: req.user._id,
    message: description,
  });

  return new ApiResponse(201, { ticket }, "Support ticket created").send(res);
});

const findOwnTicket = async (ticketId, userId) => {
  const ticket = await SupportTicket.findById(ticketId);
  if (!ticket || ticket.isDeleted) throw ApiError.notFound("Ticket not found");
  if (String(ticket.user) !== String(userId)) {
    throw ApiError.forbidden("You do not have access to this ticket");
  }
  return ticket;
};

// GET /api/support/tickets/:id
const getTicketDetails = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);
  const messages = await SupportMessage.find({ ticket: ticket._id })
    .sort({ createdAt: 1 })
    .populate("sender", "firstName lastName role");

  return new ApiResponse(200, { ticket, messages }).send(res);
});

// PATCH /api/support/tickets/:id
const updateTicket = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);

  const allowed = ["subject", "category", "priority"];
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) ticket[f] = req.body[f];
  });
  await ticket.save();

  return new ApiResponse(200, { ticket }, "Ticket updated").send(res);
});

// PATCH /api/support/tickets/:id/close
const closeTicket = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);

  ticket.status = "closed";
  ticket.closedAt = new Date();
  await ticket.save();

  return new ApiResponse(200, { ticket }, "Ticket closed").send(res);
});

// DELETE /api/support/tickets/:id
const deleteTicket = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);

  ticket.isDeleted = true;
  await ticket.save();

  return new ApiResponse(200, null, "Ticket deleted").send(res);
});

// GET /api/support/tickets/:id/messages
const getTicketMessages = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);
  const messages = await SupportMessage.find({ ticket: ticket._id })
    .sort({ createdAt: 1 })
    .populate("sender", "firstName lastName role");

  return new ApiResponse(200, { messages }).send(res);
});

// POST /api/support/tickets/:id/messages
const addTicketMessage = asyncHandler(async (req, res) => {
  const ticket = await findOwnTicket(req.params.id, req.user._id);
  if (ticket.status === "closed") throw ApiError.badRequest("Cannot message a closed ticket");

  const message = await SupportMessage.create({
    ticket: ticket._id,
    sender: req.user._id,
    message: req.body.message,
  });

  ticket.status = ticket.status === "open" ? "open" : "in_progress";
  await ticket.save();

  return new ApiResponse(201, { message }, "Message sent").send(res);
});

// --- Admin ---

// GET /api/admin/support/tickets
const getAllTicketsAdmin = asyncHandler(async (req, res) => {
  const filter = { isDeleted: false };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  if (req.query.category) filter.category = req.query.category;

  const { page, limit } = getPaginationOptions(req.query, { updatedAt: -1 });
  const result = await SupportTicket.paginate(filter, {
    page,
    limit,
    sort: { updatedAt: -1 },
    populate: [{ path: "user", select: "firstName lastName email role" }],
  });

  return new ApiResponse(200, result).send(res);
});

// PATCH /api/admin/support/tickets/:id/status
const updateTicketStatusAdmin = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound("Ticket not found");

  const { status } = req.body;
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
    throw ApiError.badRequest("Invalid status");
  }

  ticket.status = status;
  if (status === "closed") ticket.closedAt = new Date();
  await ticket.save();

  const { notifyUser } = require("../utils/notify");
  await notifyUser({
    user: ticket.user,
    title: "Support ticket updated",
    message: `Your ticket "${ticket.subject}" status changed to ${status}`,
    type: "system",
  });

  const { logAction } = require("../utils/auditLog");
  await logAction({ req, action: "update_ticket_status", entity: "SupportTicket", entityId: ticket._id });

  return new ApiResponse(200, { ticket }, "Ticket status updated").send(res);
});

// PATCH /api/admin/support/tickets/:id/assign
const assignTicketAdmin = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound("Ticket not found");

  const User = require("../models/User");
  const staff = await User.findOne({ _id: req.body.staffId, role: "admin" });
  if (!staff) throw ApiError.notFound("Support staff not found");

  ticket.assignedTo = staff._id;
  ticket.status = "in_progress";
  await ticket.save();

  const { notifyUser } = require("../utils/notify");
  await notifyUser({
    user: staff._id,
    title: "Ticket assigned",
    message: `You have been assigned ticket "${ticket.subject}"`,
    type: "system",
  });

  return new ApiResponse(200, { ticket }, "Ticket assigned").send(res);
});

module.exports = {
  getMyTickets,
  createTicket,
  getTicketDetails,
  updateTicket,
  closeTicket,
  deleteTicket,
  getTicketMessages,
  addTicketMessage,
  getAllTicketsAdmin,
  updateTicketStatusAdmin,
  assignTicketAdmin,
};

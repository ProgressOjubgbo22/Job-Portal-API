const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { getPaginationOptions } = require("../utils/pagination");

// GET /api/conversations
const getConversations = asyncHandler(async (req, res) => {
  const key = req.user.role === "applicant" ? "applicant" : "recruiter";
  const { page, limit } = getPaginationOptions(req.query, { lastMessageAt: -1 });

  const filter = { [key]: req.user._id, status: { $ne: "blocked" } };
  filter.archivedBy = { $ne: req.user._id };

  const conversations = await Conversation.find(filter)
    .sort({ lastMessageAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("applicant", "firstName lastName")
    .populate("recruiter", "firstName lastName")
    .populate("lastMessage");

  const conversationsWithUnread = await Promise.all(
    conversations.map(async (c) => {
      const unread = await Message.countDocuments({
        conversation: c._id,
        sender: { $ne: req.user._id },
        isRead: false,
      });
      return { ...c.toObject(), unreadCount: unread };
    })
  );

  return new ApiResponse(200, { conversations: conversationsWithUnread }).send(res);
});

const findAccessibleConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId)
    .populate("applicant", "firstName lastName email")
    .populate("recruiter", "firstName lastName email");
  if (!conversation) throw ApiError.notFound("Conversation not found");

  const isParticipant =
    String(conversation.applicant._id) === String(userId) ||
    String(conversation.recruiter._id) === String(userId);
  if (!isParticipant) throw ApiError.forbidden("You are not a participant in this conversation");

  return conversation;
};

// GET /api/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, req.user._id);

  const messages = await Message.find({ conversation: conversation._id, isDeleted: false })
    .sort({ createdAt: 1 })
    .populate("sender", "firstName lastName");

  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: req.user._id }, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return new ApiResponse(200, { conversation, messages }).send(res);
});

// POST /api/conversations
const startConversation = asyncHandler(async (req, res) => {
  const { receiverId, application, message } = req.body;

  const receiver = await User.findById(receiverId);
  if (!receiver) throw ApiError.notFound("Recipient not found");

  if (req.user.role === receiver.role) {
    throw ApiError.forbidden("Conversations are only allowed between an applicant and a recruiter");
  }

  const applicantId = req.user.role === "applicant" ? req.user._id : receiver._id;
  const recruiterId = req.user.role === "recruiter" ? req.user._id : receiver._id;

  let conversation = await Conversation.findOne({
    applicant: applicantId,
    recruiter: recruiterId,
    application: application || null,
  });

  if (!conversation) {
    conversation = await Conversation.create({
      applicant: applicantId,
      recruiter: recruiterId,
      application: application || null,
    });
  }

  if (conversation.status === "blocked") {
    throw ApiError.forbidden("This conversation is blocked");
  }

  const newMessage = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    message,
  });

  conversation.lastMessage = newMessage._id;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return new ApiResponse(201, { conversation, message: newMessage }, "Conversation started").send(res);
});

// PATCH /api/conversations/:id/archive
const archiveConversation = asyncHandler(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, req.user._id);

  if (!conversation.archivedBy.map(String).includes(String(req.user._id))) {
    conversation.archivedBy.push(req.user._id);
  }
  await conversation.save();

  return new ApiResponse(200, { conversation }, "Conversation archived").send(res);
});

// PATCH /api/conversations/:id/unarchive
const unarchiveConversation = asyncHandler(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, req.user._id);

  if (!conversation.archivedBy.map(String).includes(String(req.user._id))) {
    throw ApiError.badRequest("Conversation is not archived");
  }

  conversation.archivedBy = conversation.archivedBy.filter(
    (id) => String(id) !== String(req.user._id)
  );
  await conversation.save();

  return new ApiResponse(200, { conversation }, "Conversation unarchived").send(res);
});

// PATCH /api/conversations/:id/block
const blockConversation = asyncHandler(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, req.user._id);
  if (conversation.status === "blocked") throw ApiError.badRequest("Conversation is already blocked");

  conversation.status = "blocked";
  conversation.blockedBy = req.user._id;
  await conversation.save();

  return new ApiResponse(200, { conversation }, "Conversation blocked").send(res);
});

// POST /api/conversations/:id/report
const reportConversation = asyncHandler(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.id, req.user._id);
  const { reason } = req.body;
  if (!reason) throw ApiError.badRequest("A report reason is required");

  // Reports are logged as an audit entry for admin/support review
  const { logAction } = require("../utils/auditLog");
  await logAction({
    req,
    action: "report_conversation",
    entity: "Conversation",
    entityId: conversation._id,
    description: reason,
  });

  return new ApiResponse(201, null, "Conversation reported").send(res);
});

module.exports = {
  getConversations,
  getConversation,
  startConversation,
  archiveConversation,
  unarchiveConversation,
  blockConversation,
  reportConversation,
};

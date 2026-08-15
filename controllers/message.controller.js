const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/apiError");
const ApiResponse = require("../utils/apiResponse");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const findParticipantConversation = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound("Conversation not found");

  const isParticipant =
    String(conversation.applicant) === String(userId) ||
    String(conversation.recruiter) === String(userId);
  if (!isParticipant) throw ApiError.forbidden("You are not a participant in this conversation");

  return conversation;
};

// GET /api/messages/:conversationId
const getMessages = asyncHandler(async (req, res) => {
  const conversation = await findParticipantConversation(req.params.conversationId, req.user._id);

  const messages = await Message.find({ conversation: conversation._id, isDeleted: false })
    .sort({ createdAt: 1 })
    .populate("sender", "firstName lastName");

  await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: req.user._id }, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return new ApiResponse(200, { messages }).send(res);
});

// POST /api/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { conversation: conversationId, message } = req.body;
  const conversation = await findParticipantConversation(conversationId, req.user._id);

  if (["blocked", "archived"].includes(conversation.status)) {
    throw ApiError.badRequest(`Cannot send a message to a ${conversation.status} conversation`);
  }

  const newMessage = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    message,
  });

  conversation.lastMessage = newMessage._id;
  conversation.lastMessageAt = new Date();
  // Sending a new message reactivates the conversation for both participants
  conversation.archivedBy = [];
  await conversation.save();

  return new ApiResponse(201, { message: newMessage }, "Message sent").send(res);
});

// PATCH /api/messages/:id
const editMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) throw ApiError.notFound("Message not found");
  if (String(message.sender) !== String(req.user._id)) {
    throw ApiError.forbidden("You can only edit your own messages");
  }

  if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw ApiError.badRequest("Messages can only be edited within 10 minutes of sending");
  }
  if (!req.body.message) throw ApiError.badRequest("Message content is required");

  message.message = req.body.message;
  message.isEdited = true;
  await message.save();

  const conversation = await Conversation.findById(message.conversation);
  if (conversation && String(conversation.lastMessage) === String(message._id)) {
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }

  return new ApiResponse(200, { message }, "Message updated").send(res);
});

// DELETE /api/messages/:id
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) throw ApiError.notFound("Message not found");
  if (String(message.sender) !== String(req.user._id)) {
    throw ApiError.forbidden("You can only delete your own messages");
  }

  message.isDeleted = true;
  message.message = "This message was deleted";
  await message.save();

  return new ApiResponse(200, null, "Message deleted").send(res);
});

// PATCH /api/messages/read
const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { conversation: conversationId } = req.body;
  if (!conversationId) throw ApiError.badRequest("conversation is required");

  const conversation = await findParticipantConversation(conversationId, req.user._id);

  const result = await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: req.user._id }, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return new ApiResponse(200, { modifiedCount: result.modifiedCount }, "Messages marked as read").send(res);
});

// GET /api/messages/unread-count
const getUnreadCount = asyncHandler(async (req, res) => {
  const key = req.user.role === "applicant" ? "applicant" : "recruiter";
  const conversations = await Conversation.find({ [key]: req.user._id }).select("_id");
  const conversationIds = conversations.map((c) => c._id);

  const count = await Message.countDocuments({
    conversation: { $in: conversationIds },
    sender: { $ne: req.user._id },
    isRead: false,
  });

  return new ApiResponse(200, { unreadCount: count }).send(res);
});

module.exports = {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markMessagesAsRead,
  getUnreadCount,
};

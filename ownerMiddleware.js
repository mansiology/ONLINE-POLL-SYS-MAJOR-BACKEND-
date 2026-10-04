const Poll = require('../models/Poll');

/**
 * Middleware to check if the authenticated user is the owner/creator of the poll.
 * Verifies that poll.createdBy matches req.user._id.
 * Attaches the retrieved poll to req.poll.
 */
const isPollOwner = async (req, res, next) => {
  try {
    const { id } = req.params;

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: `Poll not found with id of ${id}`,
      });
    }

    // Check ownership: req.user._id was set by auth protect middleware
    const ownerId = poll.createdBy ? poll.createdBy.toString() : poll.creator?.toString();

    if (!ownerId || ownerId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not authorized to perform this action. Only the poll creator can update, close, or delete this poll.',
      });
    }

    req.poll = poll;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error while checking poll ownership authorization',
      error: error.message,
    });
  }
};

module.exports = { isPollOwner };

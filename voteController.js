const mongoose = require('mongoose');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');

/**
 * @desc    Cast a vote on a poll
 * @route   POST /api/polls/:id/vote
 * @access  Private (Authenticated users only)
 */
const castVote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { option, optionId, selectedOption, optionIndex } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid poll ID format: ${id}`,
      });
    }

    // 1. Fetch Poll
    const poll = await Poll.findById(id);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: `Poll not found with id of ${id}`,
      });
    }

    // 2. Check if poll voting is OPEN
    if (poll.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Voting is closed for this poll. No more votes can be accepted.',
      });
    }

    // 3. Resolve the selected option
    const targetOptionId = option || optionId || selectedOption;
    let selectedPollOption = null;
    let resolvedIndex = -1;

    if (targetOptionId && mongoose.Types.ObjectId.isValid(targetOptionId)) {
      resolvedIndex = poll.options.findIndex(
        (opt) => opt._id.toString() === targetOptionId.toString()
      );
      if (resolvedIndex !== -1) {
        selectedPollOption = poll.options[resolvedIndex];
      }
    } else if (typeof optionIndex === 'number' && poll.options[optionIndex]) {
      resolvedIndex = optionIndex;
      selectedPollOption = poll.options[optionIndex];
    }

    if (!selectedPollOption) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option selected. Please choose a valid option from the poll.',
      });
    }

    // 4. Duplicate-vote check before saving (Application Layer)
    const existingVote = await Vote.findOne({
      poll: poll._id,
      user: userId,
    });

    if (existingVote) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate vote prevented: You have already cast your vote on this poll. Each user can vote only once.',
        userVote: {
          option: existingVote.option,
          optionId: existingVote.option,
          createdAt: existingVote.createdAt,
        },
      });
    }

    // 5. Create vote record (Database unique index enforces this at engine level as well)
    const newVote = await Vote.create({
      poll: poll._id,
      user: userId,
      option: selectedPollOption._id,
      selectedOption: selectedPollOption._id,
      optionIndex: resolvedIndex,
    });

    res.status(201).json({
      success: true,
      message: 'Vote cast successfully!',
      vote: {
        _id: newVote._id,
        poll: newVote.poll,
        option: newVote.option,
        optionId: newVote.option,
        selectedOption: newVote.option,
        optionIndex: resolvedIndex,
        optionText: selectedPollOption.text,
        createdAt: newVote.createdAt,
      },
    });
  } catch (error) {
    // Handle race condition duplicate key error from MongoDB unique index
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate vote prevented: You have already cast your vote on this poll. Each user can vote only once.',
      });
    }
    next(error);
  }
};

/**
 * @desc    Get all votes cast by the authenticated user
 * @route   GET /api/votes/my-votes
 * @access  Private
 */
const getMyVotes = async (req, res, next) => {
  try {
    const votes = await Vote.find({ user: req.user._id })
      .populate('poll', 'question status options title brand createdBy')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: votes.length,
      votes,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  castVote,
  getMyVotes,
};

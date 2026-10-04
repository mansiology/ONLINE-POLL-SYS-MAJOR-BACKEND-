const mongoose = require('mongoose');
const Poll = require('../models/Poll');
const Vote = require('../models/Vote');

/**
 * @desc    Create a new poll
 * @route   POST /api/polls
 * @access  Private (Authenticated users)
 */
const createPoll = async (req, res, next) => {
  try {
    const { title, brand, question, options, category } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Poll question is required.',
      });
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'A poll must have at least two options.',
      });
    }

    // Format options as array of objects { text }
    const formattedOptions = options
      .map((opt) => (typeof opt === 'string' ? { text: opt.trim() } : { text: opt.text ? opt.text.trim() : '' }))
      .filter((opt) => opt.text.length > 0);

    if (formattedOptions.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'A poll must have at least two valid non-empty options.',
      });
    }

    const poll = await Poll.create({
      title: title || 'Quiz Time',
      brand: brand || 'Liceria & Co.',
      question: question.trim(),
      options: formattedOptions,
      createdBy: req.user._id,
      category: category || 'General',
      status: 'open',
    });

    res.status(201).json({
      success: true,
      message: 'Poll created successfully',
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all polls with filters, creator info, and user's vote status
 * @route   GET /api/polls
 * @access  Public (Optional auth)
 */
const getAllPolls = async (req, res, next) => {
  try {
    const { status, creator, createdBy, search, category } = req.query;
    const filter = {};

    if (status && ['open', 'closed', 'OPEN', 'CLOSED'].includes(status)) {
      filter.status = status.toLowerCase();
    }

    const targetUser = createdBy || creator;
    if (targetUser) {
      filter.createdBy = targetUser;
    }

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.question = { $regex: search, $options: 'i' };
    }

    const polls = await Poll.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // If user is authenticated, query their votes across these polls
    let userVotesMap = {};
    if (req.user) {
      const pollIds = polls.map((p) => p._id);
      const userVotes = await Vote.find({
        poll: { $in: pollIds },
        user: req.user._id,
      }).lean();

      userVotes.forEach((v) => {
        const optVal = v.option ? v.option.toString() : (v.optionId ? v.optionId.toString() : '');
        userVotesMap[v.poll.toString()] = optVal;
      });
    }

    // Get total votes per poll using aggregation
    const voteTotals = await Vote.aggregate([
      {
        $match: {
          poll: { $in: polls.map((p) => p._id) },
        },
      },
      {
        $group: {
          _id: '$poll',
          totalVotes: { $sum: 1 },
        },
      },
    ]);

    const voteTotalsMap = {};
    voteTotals.forEach((vt) => {
      voteTotalsMap[vt._id.toString()] = vt.totalVotes;
    });

    const enrichedPolls = polls.map((poll) => {
      const pollIdStr = poll._id.toString();
      const hasVoted = Boolean(userVotesMap[pollIdStr]);
      const userVotedOptionId = userVotesMap[pollIdStr] || null;
      const ownerId = poll.createdBy ? (poll.createdBy._id ? poll.createdBy._id.toString() : poll.createdBy.toString()) : '';
      const isOwner = req.user ? ownerId === req.user._id.toString() : false;

      return {
        ...poll,
        creator: poll.createdBy, // alias for backwards compatibility
        totalVotes: voteTotalsMap[pollIdStr] || 0,
        hasVoted,
        userVotedOptionId,
        isOwner,
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedPolls.length,
      polls: enrichedPolls,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single poll by ID
 * @route   GET /api/polls/:id
 * @access  Public (Optional auth)
 */
const getPollById = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: `Poll not found with id of ${req.params.id}`,
      });
    }

    let hasVoted = false;
    let userVotedOptionId = null;

    if (req.user) {
      const existingVote = await Vote.findOne({
        poll: poll._id,
        user: req.user._id,
      }).lean();

      if (existingVote) {
        hasVoted = true;
        userVotedOptionId = existingVote.option ? existingVote.option.toString() : existingVote.optionId?.toString();
      }
    }

    const totalVotes = await Vote.countDocuments({ poll: poll._id });
    const ownerId = poll.createdBy ? (poll.createdBy._id ? poll.createdBy._id.toString() : poll.createdBy.toString()) : '';
    const isOwner = req.user ? ownerId === req.user._id.toString() : false;

    res.status(200).json({
      success: true,
      poll: {
        ...poll,
        creator: poll.createdBy, // alias
        totalVotes,
        hasVoted,
        userVotedOptionId,
        isOwner,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update poll details (question, options, category) - Owner only (PUT /api/polls/:id)
 * @route   PUT /api/polls/:id & PATCH /api/polls/:id
 * @access  Private (Owner only via isPollOwner middleware)
 */
const updatePoll = async (req, res, next) => {
  try {
    const poll = req.poll;
    const { title, brand, question, category, options, status } = req.body;

    if (title) poll.title = title.trim();
    if (brand) poll.brand = brand.trim();
    if (question) poll.question = question.trim();
    if (category) poll.category = category.trim();

    if (status && ['open', 'closed'].includes(status.toLowerCase())) {
      poll.status = status.toLowerCase();
      if (poll.status === 'closed' && !poll.closedAt) {
        poll.closedAt = new Date();
      } else if (poll.status === 'open') {
        poll.closedAt = null;
      }
    }

    if (options && Array.isArray(options) && options.length >= 2) {
      const formattedOptions = options
        .map((opt) => (typeof opt === 'string' ? { text: opt.trim() } : { text: opt.text ? opt.text.trim() : '' }))
        .filter((opt) => opt.text.length > 0);

      if (formattedOptions.length >= 2) {
        // If updating options, check if existing options can be modified
        poll.options = formattedOptions;
      }
    }

    await poll.save();

    res.status(200).json({
      success: true,
      message: 'Poll updated successfully',
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete poll and associated votes - Owner only
 * @route   DELETE /api/polls/:id
 * @access  Private (Owner only via isPollOwner middleware)
 */
const deletePoll = async (req, res, next) => {
  try {
    const poll = req.poll;

    // Cascade delete all votes cast on this poll
    await Vote.deleteMany({ poll: poll._id });
    await Poll.findByIdAndDelete(poll._id);

    res.status(200).json({
      success: true,
      message: 'Poll and all associated votes deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Close voting for a poll (Owner only)
 * @route   PATCH /api/polls/:id/close
 * @access  Private (Owner only via isPollOwner middleware)
 */
const closePoll = async (req, res, next) => {
  try {
    const poll = req.poll;

    if (poll.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'This poll is already closed.',
        poll,
      });
    }

    poll.status = 'closed';
    poll.closedAt = new Date();
    await poll.save();

    res.status(200).json({
      success: true,
      message: 'Poll voting has been successfully closed.',
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reopen a closed poll (Owner only)
 * @route   PATCH /api/polls/:id/reopen
 * @access  Private (Owner only via isPollOwner middleware)
 */
const reopenPoll = async (req, res, next) => {
  try {
    const poll = req.poll;

    if (poll.status === 'open') {
      return res.status(400).json({
        success: false,
        message: 'This poll is already open.',
        poll,
      });
    }

    poll.status = 'open';
    poll.closedAt = null;
    await poll.save();

    res.status(200).json({
      success: true,
      message: 'Poll voting has been successfully reopened.',
      poll,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get poll results breakdown using MongoDB Aggregation ($group by option)
 * @route   GET /api/polls/:id/results
 * @access  Public (Optional auth)
 */
const getPollResults = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid poll ID format: ${id}`,
      });
    }

    const poll = await Poll.findById(id).populate('createdBy', 'name email');

    if (!poll) {
      return res.status(404).json({
        success: false,
        message: `Poll not found with id of ${id}`,
      });
    }

    // Required MongoDB Aggregation Pipeline: Match poll -> Group by option -> Count votes
    const aggregationBreakdown = await Vote.aggregate([
      {
        $match: {
          poll: new mongoose.Types.ObjectId(id),
        },
      },
      {
        $group: {
          _id: '$option',
          voteCount: { $sum: 1 },
        },
      },
      {
        $sort: { voteCount: -1 },
      },
    ]);

    // Build lookup dictionary
    const voteMap = {};
    let totalVotes = 0;

    aggregationBreakdown.forEach((group) => {
      const optKey = group._id ? group._id.toString() : '';
      voteMap[optKey] = group.voteCount;
      totalVotes += group.voteCount;
    });

    // Map each original poll option with its aggregated vote count & percentage
    const results = poll.options.map((option, index) => {
      const optionIdStr = option._id.toString();
      const count = voteMap[optionIdStr] || 0;
      const percentage = totalVotes > 0 ? Number(((count / totalVotes) * 100).toFixed(1)) : 0;

      return {
        _id: option._id,
        optionId: option._id,
        optionIndex: index,
        letter: String.fromCharCode(65 + index), // A, B, C, D...
        text: option.text,
        voteCount: count,
        percentage,
      };
    });

    // Determine leading option(s)
    let maxVotes = 0;
    results.forEach((opt) => {
      if (opt.voteCount > maxVotes) {
        maxVotes = opt.voteCount;
      }
    });

    const enrichedResults = results.map((opt) => ({
      ...opt,
      isWinner: maxVotes > 0 && opt.voteCount === maxVotes,
    }));

    // Check if current user has voted
    let userVote = null;
    if (req.user) {
      const voteDoc = await Vote.findOne({
        poll: poll._id,
        user: req.user._id,
      }).lean();

      if (voteDoc) {
        userVote = {
          optionId: voteDoc.option || voteDoc.optionId,
          createdAt: voteDoc.createdAt,
        };
      }
    }

    const ownerId = poll.createdBy ? (poll.createdBy._id ? poll.createdBy._id.toString() : poll.createdBy.toString()) : '';
    const isOwner = req.user ? ownerId === req.user._id.toString() : false;

    res.status(200).json({
      success: true,
      poll: {
        _id: poll._id,
        title: poll.title,
        brand: poll.brand,
        question: poll.question,
        status: poll.status,
        category: poll.category,
        createdBy: poll.createdBy,
        creator: poll.createdBy,
        createdAt: poll.createdAt,
        closedAt: poll.closedAt,
        isOwner,
      },
      totalVotes,
      results: enrichedResults,
      aggregationBreakdown,
      userVote,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPoll,
  getAllPolls,
  getPollById,
  updatePoll,
  deletePoll,
  closePoll,
  reopenPoll,
  getPollResults,
};

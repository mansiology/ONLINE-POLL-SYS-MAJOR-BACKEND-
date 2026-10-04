const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  console.error(`[Error Handler]:`, err);

  // Mongoose bad ObjectId (CastError)
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    return res.status(404).json({
      success: false,
      message,
    });
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    let message = 'Duplicate field value entered';
    if (err.keyPattern && err.keyPattern.poll && err.keyPattern.user) {
      message = 'Duplicate vote prevented: You have already cast your vote on this poll.';
      return res.status(400).json({
        success: false,
        message,
      });
    } else if (err.keyPattern && err.keyPattern.email) {
      message = 'An account with this email address already exists.';
      return res.status(409).json({
        success: false,
        message,
      });
    }
    return res.status(400).json({
      success: false,
      message,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
    return res.status(400).json({
      success: false,
      message,
    });
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
  });
};

module.exports = errorHandler;

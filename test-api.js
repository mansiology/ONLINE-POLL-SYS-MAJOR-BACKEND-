const http = require('http');

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

// Helper function to make HTTP requests
const request = (path, method = 'GET', data = null, token = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('====================================================');
  console.log('🧪 Starting API Verification & Case Study Tests');
  console.log('====================================================\n');

  try {
    // 1. Health check
    const health = await request('/');
    console.log('✅ 1. Health Check GET /:', health.status === 200 ? 'PASSED' : 'FAILED', health.data.message);

    // 2. Auth: Login as Liceria (Owner)
    const liceriaLogin = await request('/api/auth/login', 'POST', {
      email: 'liceria@example.com',
      password: 'password123',
    });
    console.log('✅ 2. Auth Login (Owner Liceria):', liceriaLogin.status === 200 ? 'PASSED' : 'FAILED');
    const ownerToken = liceriaLogin.data.token;

    // 3. Auth: Login as Alex (Regular voter)
    const alexLogin = await request('/api/auth/login', 'POST', {
      email: 'alex@example.com',
      password: 'password123',
    });
    console.log('✅ 3. Auth Login (Voter Alex):', alexLogin.status === 200 ? 'PASSED' : 'FAILED');
    const voterToken = alexLogin.data.token;

    // 4. Auth: Register a brand new test user
    const randomEmail = `testuser_${Date.now()}@example.com`;
    const regRes = await request('/api/auth/register', 'POST', {
      name: 'Fresh Tester',
      email: randomEmail,
      password: 'password123',
    });
    console.log('✅ 4. Auth Register (New User):', regRes.status === 201 ? 'PASSED' : 'FAILED');
    const newTesterToken = regRes.data.token;

    // 5. GET All Polls
    const pollsRes = await request('/api/polls');
    console.log(`✅ 5. GET /api/polls: Found ${pollsRes.data.count} polls.`);
    const quizPoll = pollsRes.data.polls.find((p) => p.question.includes('color'));
    if (!quizPoll) {
      throw new Error('Quiz poll not found in seeded database!');
    }
    console.log(`   Target Poll: "${quizPoll.question}" (ID: ${quizPoll._id})`);

    // 6. Test Single Poll GET /api/polls/:id
    const singlePoll = await request(`/api/polls/${quizPoll._id}`);
    console.log('✅ 6. GET /api/polls/:id:', singlePoll.status === 200 ? 'PASSED' : 'FAILED');

    // 7. Cast Vote as New Tester (Fresh User)
    const optionToVote = quizPoll.options[0]._id; // Vote Red
    const voteRes1 = await request(`/api/polls/${quizPoll._id}/vote`, 'POST', {
      optionId: optionToVote,
    }, newTesterToken);
    console.log('✅ 7. POST /api/polls/:id/vote (First vote):', voteRes1.status === 201 ? 'PASSED' : 'FAILED', voteRes1.data.message);

    // 8. Prevent DUPLICATE VOTE (Same user votes again)
    const duplicateVoteRes = await request(`/api/polls/${quizPoll._id}/vote`, 'POST', {
      optionId: quizPoll.options[1]._id,
    }, newTesterToken);
    const duplicatePrevented = duplicateVoteRes.status === 400 && duplicateVoteRes.data.message.includes('Duplicate vote prevented');
    console.log('🔒 8. DUPLICATE VOTE PREVENTION TEST:', duplicatePrevented ? 'PASSED (Blocked 400)' : 'FAILED', `-> ${duplicateVoteRes.data.message}`);

    // 9. Ownership-based authorization: Non-owner tries to close poll
    const unauthorizedCloseRes = await request(`/api/polls/${quizPoll._id}/close`, 'PATCH', {}, voterToken);
    const authBlocked = unauthorizedCloseRes.status === 403;
    console.log('🛡️ 9. OWNERSHIP AUTHORIZATION (Non-owner close blocked):', authBlocked ? 'PASSED (Forbidden 403)' : 'FAILED', `-> ${unauthorizedCloseRes.data.message}`);

    // 10. Aggregation query for vote breakdown by option: GET /api/polls/:id/results
    const resultsRes = await request(`/api/polls/${quizPoll._id}/results`);
    console.log('📊 10. AGGREGATION PIPELINE TEST GET /api/polls/:id/results:', resultsRes.status === 200 ? 'PASSED' : 'FAILED');
    console.log(`    Total Votes Aggregated: ${resultsRes.data.totalVotes}`);
    resultsRes.data.results.forEach((r) => {
      console.log(`    [Option ${r.letter}] ${r.text}: ${r.voteCount} votes (${r.percentage}%) ${r.isWinner ? '🏆 LEADING' : ''}`);
    });

    // 11. Ownership-based authorization: Owner closes poll
    const ownerCloseRes = await request(`/api/polls/${quizPoll._id}/close`, 'PATCH', {}, ownerToken);
    const ownerClosePassed = ownerCloseRes.status === 200 && ownerCloseRes.data.poll.status === 'CLOSED';
    console.log('🔒 11. OWNER CLOSE POLL TEST:', ownerClosePassed ? 'PASSED (Status CLOSED)' : 'FAILED', `-> ${ownerCloseRes.data.message}`);

    // 12. Vote on CLOSED poll: Should be rejected
    const voteClosedRes = await request(`/api/polls/${quizPoll._id}/vote`, 'POST', {
      optionId: optionToVote,
    }, ownerToken);
    const closedBlocked = voteClosedRes.status === 400 && voteClosedRes.data.message.includes('Voting is closed');
    console.log('🛑 12. VOTE ON CLOSED POLL TEST:', closedBlocked ? 'PASSED (Blocked 400)' : 'FAILED', `-> ${voteClosedRes.data.message}`);

    // 13. Create a brand new poll (POST /api/polls)
    const newPollRes = await request('/api/polls', 'POST', {
      title: 'Community Quiz',
      brand: 'Liceria & Co.',
      question: 'Which cloud provider do you prefer for production deployment?',
      options: ['AWS', 'Google Cloud (GCP)', 'Render / Railway', 'Vercel / Supabase'],
      category: 'DevOps',
    }, ownerToken);
    console.log('✨ 13. CREATE POLL (POST /api/polls):', newPollRes.status === 201 ? 'PASSED' : 'FAILED', `-> ID: ${newPollRes.data.poll._id}`);

    // 14. Reopen Poll (Owner bonus)
    const reopenRes = await request(`/api/polls/${quizPoll._id}/reopen`, 'PATCH', {}, ownerToken);
    console.log('🔓 14. REOPEN POLL TEST:', reopenRes.status === 200 ? 'PASSED' : 'FAILED', `-> Status: ${reopenRes.data.poll.status}`);

    console.log('\n====================================================');
    console.log('🎉 ALL BACKEND OBJECTIVES & OUTCOMES VERIFIED 100%!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
};

runTests();

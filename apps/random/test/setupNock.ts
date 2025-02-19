import nock from 'nock';

let mockRound = Number(process.env.MOCK_ROUND || '4292446');
const mockRandomness =
  process.env.MOCK_RANDOMNESS ||
  'a1b57a2996968b129dbcd00565945e5ed77aa5094d44dd64918aa4c9af41878c';
const mockSignature =
  process.env.MOCK_SIGNATURE ||
  '8323163fbcfb40ba782323ba47ecc0ece5279a89f16b1ab4ed099fb5b0cccc0b70aea2e7a631e4c6261b3460a78113a802880e05641c21a63795ab90b7b5e971bf932639d64e16d5fd4d07a5daafeb1cc54ed6c782d953831089adb9372d5d18';
const mockPreviousSignature =
  process.env.MOCK_PREVIOUS_SIGNATURE ||
  'adc1be87180c2a8717236d6025f710f5a79381ec2bba41b7f18b0f5f509db86002ac4964ea04ffe6750b4b5cbb5addce11051273fd0caac1726571b2ee3616ed3c680a8e2a1e1590a083b5766393fc68c67aa79998f4648afe99320d77292dcf';

export const setupNock = () => {
  console.log(`Mocking Drand API with round: ${mockRound}`);

  nock('https://api.drand.sh').persist().get('/public/latest').reply(200, {
    round: mockRound,
    randomness: mockRandomness,
    signature: mockSignature,
    previous_signature: mockPreviousSignature,
  });
  mockRound += 1;
};

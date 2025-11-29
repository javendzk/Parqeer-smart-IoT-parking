const digits = '0123456789';

const generateVoucher = () => {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.random() * digits.length);
    code += digits[index];
  }
  return code;
};

module.exports = { generateVoucher };

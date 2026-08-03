const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 ETRAI Backend Server listening on port ${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/v1/health`);
  console.log(`====================================================`);
});

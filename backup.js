exports.servepay = async (req, res) => {
  try {
    const { UserId, OrderId } = req.params;

    // Validate Operator
    const user = await User.findOne({ UserId });
    if (
      !user ||
      !user.Operator ||
      !user.Operator.verified ||
      ["pending", "verified"].includes(user.Operator.Status)
    ) {
      return res.status(404).send("Wallet not found");
    }

    // Check Operator's Wallet
    const wallet = await Wallet.findOne({
      OperatorId: user.Operator.OperatorId,
    });
    if (!wallet) {
      return res.status(404).send("Wallet not found");
    }

    // Find Order in Wallet Transactions
    const order = wallet.Transactions.find((item) => item.orderId === OrderId);
    if (!order || order.status !== "pending") {
      return res.status(404).send("Order not found or not pending");
    }

    // Serve Razorpay Payment Page
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Razorpay Payment</title>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        /* Add your custom styles here */
        body {
          font-family: Arial, sans-serif;
          background-color: #f0f0f0;
          padding: 20px;
        }
        /* Additional styles as needed */
      </style>
    </head>
    <body>
      <div id="payment-container">
        <!-- Razorpay integration script -->
      </div>

      <script>
        const key = 'rzp_test_TZAshUrYdjeY7N';
        const orderId = '${OrderId}';
        const amount = ${order.amount * 100};

        var options = {
          key: key,
          amount: amount,
          currency: 'INR',
          name: 'Drive Sync',
          description: 'Wallet Topup ₹${order.amount}',
          image: 'https://example.com/logo.png',
          order_id: orderId,
          handler: function(response) {
            alert('Payment successful');
    
            // Send payment response to server
            fetch('/Operator/wallet/topup/razorpay/${user.UserId}/${
      order.orderId
    }/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                operatorId:'${user.Operator.OperatorId}'
              })
            })
            .then(res => res.json())
            .then(data => {
              console.log(data.message);
            })
            .catch(err => {
              console.error('Error:', err);
            });
          },
          prefill: {
            email: '${user.EmailId}',
            contact: '${user.PhoneNo.slice(3)}',
            name: '${user.Name}'
          },
          theme: {
            color: '#53a20e'
          }
        };

        // Automatically load Razorpay checkout on page load
        var rzp = new Razorpay(options);
        rzp.open();
      </script>
    </body>
    </html>
    `;

    res.status(200).send(html);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
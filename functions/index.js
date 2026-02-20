const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// 이메일 설정 - 실제 배포 시 환경변수로 설정하세요
// firebase functions:config:set email.user="your@gmail.com" email.pass="your_app_password"
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "your@gmail.com",
    pass: process.env.EMAIL_PASS || "your_app_password",
  },
});

// 주문 생성 시 자동 이메일 발송
exports.sendOrderEmail = onDocumentCreated("orders/{orderId}", async (event) => {
  const order = event.data.data();

  const itemsList = order.items
    .map(
      (item) =>
        `- ${item.productName}: ${item.quantity.toLocaleString()}개 x ${item.wholesalePrice.toLocaleString()}원 = ${(item.quantity * item.wholesalePrice).toLocaleString()}원`
    )
    .join("\n");

  const mailOptions = {
    from: process.env.EMAIL_USER || "your@gmail.com",
    to: order.companyEmail,
    subject: `[K-Beauty Export] 주문 요청 - ${order.companyName}`,
    text: `${order.companyName} 담당자님께,

아래와 같이 주문을 요청드립니다.

[주문 내역]
${itemsList}

총 금액: ${order.totalAmount.toLocaleString()}원

확인 후 회신 부탁드립니다.
감사합니다.

K-Beauty Export 관리자`,
  };

  try {
    await transporter.sendMail(mailOptions);
    await event.data.ref.update({ emailSent: true });
    console.log("주문 이메일 발송 완료:", order.companyEmail);
  } catch (error) {
    console.error("이메일 발송 실패:", error);
    await event.data.ref.update({ emailSent: false, emailError: error.message });
  }
});

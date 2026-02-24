const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getStorage } = require("firebase-admin/storage");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const nodemailer = require("nodemailer");
const { defineSecret } = require("firebase-functions/params");

initializeApp();

const gmailEmail = defineSecret("GMAIL_EMAIL");
const gmailPassword = defineSecret("GMAIL_APP_PASSWORD");

exports.onNewCompanyRegistered = onDocumentCreated(
  {
    document: "companies/{companyId}",
    secrets: [gmailEmail, gmailPassword],
    region: "asia-northeast3",
  },
  async (event) => {
    const data = event.data.data();
    const companyName = data.companyName || "알 수 없음";
    const email = data.email || "-";
    const phone = data.phone || "-";
    const representative = data.representative || "-";
    const businessNumber = data.businessNumber || "-";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailEmail.value(),
        pass: gmailPassword.value(),
      },
    });

    const mailOptions = {
      from: `HIBOS Export <info@hibos.co.kr>`,
      to: "brainseekr@gmail.com",
      subject: `[HIBOS] 신규 업체 등록: ${companyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5cf6; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">신규 업체 등록 알림</h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr><td style="padding: 8px; color: #666; width: 100px;">회사명</td><td style="padding: 8px; font-weight: bold;">${companyName}</td></tr>
            <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">대표자</td><td style="padding: 8px;">${representative}</td></tr>
            <tr><td style="padding: 8px; color: #666;">사업자번호</td><td style="padding: 8px;">${businessNumber}</td></tr>
            <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">연락처</td><td style="padding: 8px;">${phone}</td></tr>
            <tr><td style="padding: 8px; color: #666;">이메일</td><td style="padding: 8px;">${email}</td></tr>
          </table>
          <p style="margin-top: 20px; color: #999; font-size: 12px;">HIBOS Export 관리자 알림</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`관리자 알림 메일 전송 완료: ${companyName}`);

    // 업체에게 감사 메일 발송
    if (email && email !== "-") {
      const thankYouMail = {
        from: `HIBOS Export <info@hibos.co.kr>`,
        to: email,
        subject: `[HIBOS] ${companyName}님, 업체 등록이 완료되었습니다!`,
        html: `
          <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 560px; margin: 0 auto; padding: 30px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #8b5cf6; font-size: 24px; margin: 0;">HIBOS Export</h1>
            </div>
            <h2 style="color: #333; font-size: 18px;">안녕하세요, ${companyName} ${representative}님!</h2>
            <p style="color: #555; line-height: 1.8; font-size: 14px;">
              HIBOS Export 플랫폼에 업체 등록해 주셔서 진심으로 감사드립니다.
            </p>
            <p style="color: #555; line-height: 1.8; font-size: 14px;">
              등록하신 정보를 확인 후, 빠른 시일 내에 연락드리겠습니다.<br/>
              납품 가능한 제품이 있으시면 아래 링크에서 제품 등록도 진행해 주세요.
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="https://hibos-export.com/products"
                style="display: inline-block; background: #8b5cf6; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
                납품 제품 등록하기
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px; line-height: 1.6;">
              상호명: 히보스 | 대표자: 이주호<br/>
              사업자등록번호: 135-41-00648<br/>
              이메일: info@hibos.co.kr
            </p>
          </div>
        `,
      };
      await transporter.sendMail(thankYouMail);
      console.log(`감사 메일 전송 완료: ${companyName} (${email})`);
    }
  }
);

// 관리자 메일 발송 (PDF 첨부 지원)
exports.sendEmail = onCall(
  {
    secrets: [gmailEmail, gmailPassword],
    region: "asia-northeast3",
    maxInstances: 5,
  },
  async (request) => {
    // 인증 확인
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const { to, subject, html, attachmentPaths } = request.data;

    if (!to || !subject || !html) {
      throw new HttpsError("invalid-argument", "수신자, 제목, 본문은 필수입니다.");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailEmail.value(),
        pass: gmailPassword.value(),
      },
    });

    const mailOptions = {
      from: `HIBOS Export <info@hibos.co.kr>`,
      to,
      subject,
      html,
      attachments: [],
    };

    // Firebase Storage에서 첨부파일 다운로드
    if (attachmentPaths && attachmentPaths.length > 0) {
      const bucket = getStorage().bucket();
      for (const filePath of attachmentPaths) {
        const file = bucket.file(filePath);
        const [buffer] = await file.download();
        const fileName = filePath.split("/").pop();
        mailOptions.attachments.push({
          filename: fileName,
          content: buffer,
        });
      }
    }

    try {
      await transporter.sendMail(mailOptions);
      return { success: true, message: "메일 발송 완료" };
    } catch (error) {
      console.error("메일 발송 실패:", error);
      throw new HttpsError("internal", "메일 발송 중 오류가 발생했습니다.");
    }
  }
);


# Checkin

GitHub Actions 实现 [GLaDOS][glados] 自动签到。

([GLaDOS][glados] 可用邀请码: `MW4DK-O0RSF-C7AOU-EN1MP`, 双方都有奖励天数)

## 使用说明

1. Fork 这个仓库。
1. 登录 GLaDOS 获取最新 Cookie。
1. 在仓库 `Settings → Secrets and variables → Actions` 中添加或更新 Secret `GLADOS`。
1. 启用 Actions。任务默认每天北京时间 00:23 运行，也可以在 Actions 页面手动运行。

## 高级功能

1. 多个账号可以写为多行 Secret `GLADOS`，每行一个 Cookie。
1. 如需修改时间，可以修改文件 [run.yml](.github/workflows/run.yml) 中的 `cron` 参数，格式可参考 [crontab]。
1. 如需推送通知，可配置 Secret `NOTIFY`，支持：
   - [WxPusher][wxpusher]：`wxpusher:{token}:{uid}`
   - [PushPlus][pushplus]：`pushplus:{token}`
   - 企业微信群机器人：`qyweixin:{key}`
   - 多个通知渠道可以写成多行。

## 失败处理

- 签到失败时，Actions 会显示红色失败状态，不再出现“显示成功但实际未签到”。
- 网络超时、HTTP 429 或服务端错误会有限重试。
- 如果服务端返回 `device-mismatch`，脚本会按照登录设备平台自动调整 User-Agent，并且只重试一次。
- 如果日志提示 `没有权限`、`Automated check-in detected` 或要求重新登录，请在 GLaDOS 网页重新登录，然后更新 Secret `GLADOS`。
- GitHub 的定时任务可能延迟；需要立即验证时请使用 `Run workflow` 手动运行。
- Cookie 和接口数据包含账号敏感信息，请勿写入代码、Issue 或公开日志。

---

[glados]: https://glados.cloud/console/checkin
[crontab]: https://crontab.guru/
[pushplus]: https://www.pushplus.plus/
[wxpusher]: https://wxpusher.zjiecode.com/


const CHECKIN_URL = 'https://glados.cloud/api/user/checkin'
const STATUS_URL = 'https://glados.cloud/api/user/status'
const REFERER = 'https://glados.cloud/console/checkin'
const ALREADY_CHECKED_IN = /repeat|already|已签到|已经签到|重复/i
const AUTH_ERROR = /没有权限|unauthorized|forbidden|登录|cookie/i

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const requestJson = async (url, options, maxAttempts = 3) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      const text = await response.text()
      let data

      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        const error = new Error(`接口返回了非 JSON 数据 (HTTP ${response.status})`)
        error.retryable = response.status >= 500
        throw error
      }

      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status}: ${data?.message || response.statusText}`
        )
        error.retryable = response.status === 429 || response.status >= 500
        throw error
      }

      return data
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      const retryable = timedOut || error instanceof TypeError || error?.retryable

      if (retryable && attempt < maxAttempts) {
        const delay = attempt * 2_000
        console.warn(`请求暂时失败，${delay / 1000} 秒后进行第 ${attempt + 1} 次尝试`)
        await sleep(delay)
        continue
      }

      if (timedOut) throw new Error('请求超时')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

const hasFailureCode = (data) =>
  data?.code !== undefined && Number(data.code) !== 0

const glados = async () => {
  const secret = String(process.env.GLADOS || '').trim()
  if (!secret) {
    return {
      failed: true,
      notice: ['Checkin Error', 'Secret GLADOS 未配置或内容为空'],
    }
  }

  const cookies = secret.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  const details = []
  let failed = false

  for (const [index, cookie] of cookies.entries()) {
    const account = `账号 ${index + 1}`

    try {
      const commonHeaders = {
        cookie,
        referer: REFERER,
        'user-agent': 'Mozilla/5.0',
      }
      const action = await requestJson(CHECKIN_URL, {
        method: 'POST',
        headers: { ...commonHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'glados.cloud' }),
      })
      const actionMessage = String(action?.message || '签到接口未返回说明')

      if (hasFailureCode(action) && !ALREADY_CHECKED_IN.test(actionMessage)) {
        throw new Error(actionMessage)
      }

      const status = await requestJson(STATUS_URL, {
        method: 'GET',
        headers: commonHeaders,
      })
      if (hasFailureCode(status)) throw new Error(status?.message || '状态查询失败')
      if (!status?.data) throw new Error('状态接口未返回账户数据')

      details.push(
        `${account}: Checkin OK`,
        `${actionMessage}`,
        `Left Days ${Number(status.data.leftDays)}`
      )
    } catch (error) {
      failed = true
      const message = error instanceof Error ? error.message : String(error)
      const explanation = AUTH_ERROR.test(message)
        ? `Cookie 已失效或不完整（${message}）`
        : message
      details.push(`${account}: Checkin Error`, explanation)
    }
  }

  return {
    failed,
    notice: [failed ? 'Checkin Error' : 'Checkin OK', ...details],
  }
}

const notify = async (notice) => {
  const options = String(process.env.NOTIFY || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  let failed = false

  for (const option of options) {
    if (option.startsWith('console:')) continue

    const [channel] = option.split(':')
    try {
      let response
      if (option.startsWith('wxpusher:')) {
        response = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        response = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${option.split(':')[1]}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              msgtype: 'markdown',
              markdown: { content: notice.join('<br>') },
            }),
          }
        )
      } else {
        const token = option.startsWith('pushplus:')
          ? option.split(':')[1]
          : option
        response = await fetch('https://www.pushplus.plus/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      failed = true
      console.error(`通知发送失败 (${channel}): ${error?.message || error}`)
    }
  }

  return failed
}

const main = async () => {
  const result = await glados()
  for (const line of result.notice) console.log(line)

  const notificationFailed = await notify(result.notice)
  if (result.failed || notificationFailed) {
    console.error(
      '::error title=GLaDOS check-in failed::请查看日志；若提示 Cookie 失效，请更新 Secret GLADOS'
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Checkin Error')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})


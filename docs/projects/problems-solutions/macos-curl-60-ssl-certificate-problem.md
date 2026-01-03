### macOS curl 报错 (60) SSL certificate problem 的一次修复记录

- **问题现象**: 执行如下命令报错 `curl: (60) SSL certificate problem: unable to get local issuer certificate`
  ```bash
  curl -v https://xxx
  ```

- **环境信息**
  - macOS，`curl -V` 显示为 Anaconda 提供的 curl：`curl 8.2.1 ... OpenSSL/3.0.10`
  - 环境变量：`CURL_CA_BUNDLE` 与 `SSL_CERT_FILE` 指向 `~/cert/cacert.pem`
  - 该自定义 CA 证书包已过期，导致校验失败

- **快速定位**
  - `curl -Iv https://目标` 显示使用的 CAfile 为 `~/cert/cacert.pem`，并报 `unable to get local issuer certificate`
  - 用 Homebrew 的 CA 包测试：`curl --cacert $(brew --prefix)/etc/ca-certificates/cert.pem -Iv https://目标` 校验证书正常

- **根因**
  - Anaconda 版 curl 被环境变量强制使用了过期的自定义 CA 包，无法验证服务器证书链

- **修复方案 A（推荐）**
  1) 安装/更新 Homebrew 证书包
     ```bash
     brew reinstall ca-certificates
     ```
  2) 将 curl 的 CA 指向 Homebrew 的证书包（当前会话）
     ```bash
     export CURL_CA_BUNDLE="$(brew --prefix)/etc/ca-certificates/cert.pem"
     export SSL_CERT_FILE="$CURL_CA_BUNDLE"
     ```
  3) 持久化到 shell 配置（zsh 示例）
     ```bash
     echo 'export CURL_CA_BUNDLE="$(brew --prefix)/etc/ca-certificates/cert.pem"' >> ~/.zshrc
     echo 'export SSL_CERT_FILE="$CURL_CA_BUNDLE"' >> ~/.zshrc
     source ~/.zshrc
     ```
  4) 验证
     ```bash
     curl -v  https://xxx
     ```

- **替代方案 B**（更新旧路径中的证书文件）
  ```bash
  brew reinstall ca-certificates
  install -m 0644 "$(brew --prefix)/etc/ca-certificates/cert.pem" "$HOME/cert/cacert.pem"
  ```

- **临时绕过（排障用，不推荐长期使用）**
  ```bash
  curl -k https://...
  ```

- **相关排查命令备忘**
  - 查看 curl 版本与 SSL 后端：`curl -V`
  - 查看握手与证书链：`curl -Iv https://域名`
  - 显式指定 CA 包测试：`curl --cacert /path/to/cert.pem -Iv https://域名`

- **结论**
  - 问题由过期的自定义 CA 包引起。将 curl 指向 Homebrew 的最新 CA 证书包后，证书链验证与下载恢复正常。

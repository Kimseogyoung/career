// 비밀번호를 입력받는다. Windows cmd/PowerShell 포함해 안정적으로 동작하도록
// readline 의 가림(terminal:true) 대신 raw 모드로 키 입력을 직접 읽는다.
//
// - TTY 면: 화면에 안 보이게 받고, 각 글자는 `*` 로 표시
// - 파이프 입력이면: 한 줄을 그대로 읽음 (자동화/테스트용)

export function promptPassword(label = "비밀번호: ") {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // 비대화형(파이프) 입력: 한 줄 읽어서 반환.
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        buf += chunk;
      });
      stdin.on("end", () => resolve(buf.replace(/\r?\n$/, "")));
    });
  }

  return new Promise((resolve, reject) => {
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";

    const onData = (key) => {
      // 한 번에 여러 바이트가 올 수 있다(붙여넣기 등). 글자 단위로 처리.
      for (const ch of key) {
        const code = ch.charCodeAt(0);
        if (ch === "\r" || ch === "\n") {
          // 입력 종료
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(password);
          return;
        } else if (code === 3) {
          // Ctrl+C
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          reject(new Error("취소됨"));
          return;
        } else if (code === 8 || code === 127) {
          // Backspace / Delete
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (code < 32) {
          // 그 밖의 제어문자(화살표 등)는 무시
        } else {
          password += ch;
          stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

//! triary-backend バイナリ entry point。
//!
//! ロジックは全て [`triary_backend`] (lib crate) に置いており、
//! ここはプロセスの起動・終了を担うだけの薄いラッパー。

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    triary_backend::run().await
}

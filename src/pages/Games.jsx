import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";
import answersData from "../data/wordle-answers.json";
import "../styles/games.css";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const GAME_NAME = "daily_wordle";
const POINTS_BY_ATTEMPT = [10, 5, 4, 3, 2, 1];

const sanitizeWords = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((word) => typeof word === "string")
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length === WORD_LENGTH && /^[A-Z]+$/.test(word));
};

const RAW_FALLBACK_WORDS = [
  "about", "adapt", "adore", "adult", "after", "agent", "agile", "alert", "align", "alive",
  "allow", "alone", "amber", "amend", "among", "angle", "apple", "apply", "arise", "armor",
  "aroma", "array", "arrow", "aside", "audio", "avail", "awake", "aware", "badge", "baker",
  "basic", "beach", "begin", "being", "blame", "blast", "bleak", "blend", "blink", "bloom",
  "boost", "brain", "brave", "bread", "break", "brick", "bride", "bring", "broad", "brook",
  "brown", "brush", "build", "cabin", "cable", "candy", "cargo", "carve", "catch", "cause",
  "cedar", "chain", "chair", "charm", "chart", "chase", "cheer", "chess", "chime", "choir",
  "cider", "civic", "claim", "climb", "clock", "close", "cloth", "cloud", "coach", "coast",
  "coral", "count", "cover", "crane", "crash", "crate", "crisp", "crown", "cycle", "daily",
  "dance", "debut", "decay", "delta", "demon", "dodge", "donor", "doubt", "dozen", "draft",
  "drain", "drama", "dream", "dress", "drink", "drive", "earth", "elder", "elect", "elite",
  "ember", "enjoy", "entry", "equal", "erase", "event", "exact", "exalt", "exist", "fable",
  "faint", "faith", "feast", "fever", "field", "fiery", "final", "flair", "flame", "flare",
  "flash", "fleet", "fling", "floor", "flour", "flute", "focus", "force", "forge", "forth",
  "found", "frame", "fresh", "fruit", "gauge", "giant", "gleam", "glide", "globe", "glory",
  "gnome", "goose", "grace", "grade", "grain", "grant", "grape", "graph", "grasp", "great",
  "green", "greet", "grief", "grind", "grove", "guard", "guess", "guest", "guide", "habit",
  "happy", "hasty", "hatch", "heart", "heavy", "hinge", "honey", "honor", "horse", "hotel",
  "house", "hover", "human", "humid", "humor", "hurry", "ideal", "image", "imply", "index",
  "ingot", "inner", "input", "irony", "issue", "ivory", "jaunt", "jelly", "jewel", "joint",
  "jolly", "judge", "karma", "kneel", "knock", "known", "label", "labor", "laser", "laugh",
  "layer", "lemon", "level", "light", "limit", "linen", "logic", "loose", "lover", "lower",
  "loyal", "lucky", "lunar", "lyric", "magic", "major", "maker", "march", "maybe", "medal",
  "melon", "merit", "metal", "metro", "micro", "might", "minor", "model", "money", "month",
  "moral", "mouse", "mouth", "movie", "music", "naive", "nerve", "never", "noble", "noise",
  "north", "novel", "nurse", "ocean", "olive", "onion", "opera", "orbit", "order", "other",
  "outer", "oxide", "owner", "paint", "panel", "party", "patch", "peach", "pearl", "phase",
  "phone", "photo", "piano", "pilot", "pixel", "place", "plain", "plane", "plant", "plate",
  "plaza", "plead", "point", "poise", "polar", "power", "press", "price", "pride", "prime",
  "print", "prior", "prism", "prize", "probe", "proud", "prove", "pulse", "punch", "quail",
  "quart", "queen", "quick", "quiet", "quilt", "quote", "radar", "radio", "raise", "rally",
  "range", "rapid", "ratio", "reach", "react", "ready", "realm", "refer", "relax", "reply",
  "reset", "ridge", "right", "rigid", "river", "roast", "robot", "rough", "round", "route",
  "rover", "royal", "ruler", "safer", "saint", "salad", "sauce", "scale", "scene", "scent",
  "scope", "score", "scout", "serve", "seven", "shade", "shake", "shall", "shape", "share",
  "sharp", "shear", "sheet", "shine", "shiny", "shock", "shore", "short", "shout", "shown",
  "sight", "since", "skill", "skirt", "slate", "sleep", "slice", "slide", "slope", "smart",
  "smile", "smoke", "snake", "sneak", "snowy", "solar", "solid", "solve", "sound", "south",
  "space", "spare", "spark", "speak", "speed", "spice", "spike", "spine", "spoke", "sport",
  "spray", "squad", "stage", "stair", "stake", "stale", "stamp", "stand", "stare", "start",
  "state", "steam", "steel", "steep", "stern", "stick", "still", "sting", "stock", "stone",
  "stood", "store", "storm", "story", "stove", "study", "style", "sugar", "suite", "sunny",
  "super", "surge", "swift", "swing", "sword", "table", "taste", "teach", "teeth", "tempo",
  "thank", "their", "theme", "there", "these", "thick", "thief", "thing", "think", "third",
  "those", "three", "throw", "thumb", "tiger", "tight", "timer", "title", "today", "token",
  "tonic", "topic", "torch", "total", "touch", "tough", "tower", "toxic", "trace", "track",
  "trade", "trail", "train", "trait", "treat", "trend", "trial", "tribe", "trick", "tried",
  "truly", "trump", "trunk", "trust", "truth", "twice", "twist", "ultra", "uncle", "under",
  "union", "unite", "unity", "until", "upper", "upset", "urban", "usage", "usher", "usual",
  "utter", "vague", "valid", "valor", "value", "vapor", "vault", "vigor", "vital", "vivid",
  "vocal", "voice", "voter", "wagon", "waist", "watch", "water", "weary", "weave", "wedge",
  "weigh", "whale", "wheat", "wheel", "where", "which", "while", "whirl", "white", "whole",
  "widow", "width", "wield", "windy", "wiser", "witch", "witty", "woken", "woman", "women",
  "world", "worry", "worth", "would", "wound", "wrath", "wreck", "wrist", "write", "wrong",
  "wrote", "yeast", "yield", "young", "zebra", "zesty"
];

const FALLBACK_WORDS = (() => {
  const sanitized = sanitizeWords(RAW_FALLBACK_WORDS);
  return sanitized.length > 0 ? sanitized : ["ABOUT", "AGENT", "AUDIO", "BRAIN", "BRAVE"];
})();

const ANSWER_LIST = (() => {
  const sanitizedAnswers = sanitizeWords(answersData);
  return sanitizedAnswers.length > 0 ? sanitizedAnswers : FALLBACK_WORDS;
})();

const getLocalDateKey = () => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localMidnight = new Date(now.getTime() - tzOffset);
  return localMidnight.toISOString().split("T")[0];
};

const getDailyWord = (dateKey, answers) => {
  if (!answers || answers.length === 0) return "";
  const baseDate = new Date("2024-01-01T00:00:00Z");
  const targetDate = new Date(`${dateKey}T00:00:00Z`);
  const diffDays = Math.floor((targetDate.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000));
  const index = ((diffDays % answers.length) + answers.length) % answers.length;
  return answers[index];
};

const evaluateGuess = (guess, answer) => {
  const guessChars = guess.split("");
  const answerChars = answer.split("");
  const result = Array(WORD_LENGTH).fill("absent");
  const consumed = Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = "correct";
      consumed[i] = true;
      answerChars[i] = null;
    }
  }

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] === "correct") continue;
    const letter = guessChars[i];
    const matchIndex = answerChars.findIndex((ch, idx) => !consumed[idx] && ch === letter);
    if (matchIndex !== -1) {
      result[i] = "present";
      consumed[matchIndex] = true;
      answerChars[matchIndex] = null;
    }
  }

  return result;
};

const attemptsToPoints = (attempts, success) => {
  if (!success) return 0;
  const index = Math.min(Math.max(attempts - 1, 0), POINTS_BY_ATTEMPT.length - 1);
  return POINTS_BY_ATTEMPT[index] ?? 0;
};

const hydrateGuesses = (words, answer) => {
  if (!Array.isArray(words)) return [];
  return words
    .filter((word) => typeof word === "string" && word.length === WORD_LENGTH)
    .map((word) => {
      const upperWord = word.toUpperCase();
      return {
        word: upperWord,
        tiles: evaluateGuess(upperWord, answer)
      };
    });
};

function Games() {
  const { user } = useAuth();
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const storageKey = useMemo(
    () => `plop-daily-wordle-${todayKey}-${user?.id || "guest"}`,
    [todayKey, user?.id]
  );

  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameStatus, setGameStatus] = useState("playing");
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultSubmitted, setResultSubmitted] = useState(false);
  const [submittingResult, setSubmittingResult] = useState(false);

  const [dailyBoard, setDailyBoard] = useState([]);
  const [pointsBoard, setPointsBoard] = useState([]);
  const [activeLeaderboard, setActiveLeaderboard] = useState("daily");
  const [loadingScores, setLoadingScores] = useState(true);
  const [scoreError, setScoreError] = useState("");

  const dailyWord = useMemo(() => getDailyWord(todayKey, ANSWER_LIST), [todayKey]);
  const todayDisplay = useMemo(() => {
    const [year, month, day] = todayKey.split("-");
    return `${month}-${day}-${year}`;
  }, [todayKey]);

  const persistState = useCallback(
    (state) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          guesses: state.guesses,
          status: state.status,
          currentGuess: state.currentGuess,
          resultSubmitted: state.resultSubmitted
        })
      );
    },
    [storageKey]
  );

  useEffect(() => {
    if (!dailyWord) return;

    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.guesses)) {
        setGuesses(parsed.guesses);
      }
      if (typeof parsed.currentGuess === "string") {
        setCurrentGuess(parsed.currentGuess);
      }
      if (parsed.status) {
        setGameStatus(parsed.status);
        if (parsed.status === "won") {
          setResultMessage("You already solved today's puzzle. Come back tomorrow!");
        } else if (parsed.status === "lost") {
          setResultMessage(`The word was ${dailyWord}. Try again tomorrow!`);
        }
      }
      if (parsed.resultSubmitted) {
        setResultSubmitted(true);
      }
    } catch (error) {
      console.warn("Unable to read saved puzzle state", error);
    }
  }, [storageKey, dailyWord]);

  useEffect(() => {
    if (!user?.id || !dailyWord) return undefined;

    let isMounted = true;

    const syncExistingResult = async () => {
      try {
        const { data, error } = await supabase
          .from("game_scores")
          .select("attempts, success, guesses, points")
          .eq("game_name", GAME_NAME)
          .eq("game_date", todayKey)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (error && error.code !== "PGRST116") {
          console.error("Error checking previous result:", error);
          return;
        }

        if (!data) {
          return;
        }

        const reconstructedGuesses = hydrateGuesses(data.guesses, dailyWord);
        const attemptsUsed = data.attempts ?? reconstructedGuesses.length;
        const success = Boolean(data.success);
        const status = success ? "won" : "lost";
        const pointsEarned = attemptsToPoints(attemptsUsed, success);
        const message = success
          ? `Nice work! You already solved today's puzzle in ${attemptsUsed} guess${attemptsUsed === 1 ? "" : "es"} and earned ${pointsEarned} point${pointsEarned === 1 ? "" : "s"}.`
          : `The word was ${dailyWord}. Better luck tomorrow!`;

        setGuesses(reconstructedGuesses);
        setCurrentGuess("");
        setGameStatus(status);
        setResultMessage(message);
        setResultSubmitted(true);
        persistState({
          guesses: reconstructedGuesses,
          status,
          currentGuess: "",
          resultSubmitted: true
        });
      } catch (err) {
        if (!isMounted) return;
        console.error("Error syncing previous result:", err);
      }
    };

    syncExistingResult();

    return () => {
      isMounted = false;
    };
  }, [user?.id, dailyWord, todayKey, persistState]);

  const fetchScoreboard = useCallback(async () => {
    setLoadingScores(true);
    setScoreError("");

    try {
      const { data: dailyData, error: dailyError } = await supabase
        .from("game_scores")
        .select("user_id, attempts, success, completed_at, points")
        .eq("game_name", GAME_NAME)
        .eq("game_date", todayKey)
        .order("success", { ascending: false })
        .order("attempts", { ascending: true, nullsFirst: false })
        .order("completed_at", { ascending: true });

      if (dailyError) throw dailyError;

      const { data: pointsData, error: pointsError } = await supabase
        .from("game_scores")
        .select("user_id, points")
        .eq("game_name", GAME_NAME);

      if (pointsError) throw pointsError;

      const profileIds = new Set();
      (dailyData || []).forEach((entry) => profileIds.add(entry.user_id));
      (pointsData || []).forEach((entry) => profileIds.add(entry.user_id));

      let profilesMap = new Map();
      if (profileIds.size > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, nickname, avatar_url")
          .in("id", Array.from(profileIds));

        if (profilesError) throw profilesError;
        profilesMap = new Map((profilesData || []).map((profile) => [profile.id, profile]));
      }

      setDailyBoard(
        (dailyData || []).map((entry) => ({
          ...entry,
          profile: profilesMap.get(entry.user_id)
        }))
      );

      const totalPointsMap = new Map();
      (pointsData || []).forEach((entry) => {
        const current = totalPointsMap.get(entry.user_id) || 0;
        totalPointsMap.set(entry.user_id, current + (entry.points || 0));
      });

      const orderedTotals = Array.from(totalPointsMap.entries())
        .map(([userId, totalPoints]) => ({
          user_id: userId,
          totalPoints,
          profile: profilesMap.get(userId)
        }))
        .sort((a, b) => b.totalPoints - a.totalPoints);

      setPointsBoard(orderedTotals);
    } catch (error) {
      console.error("Error loading leaderboards:", error);
      setScoreError("Unable to load leaderboards. Please try again later.");
      setDailyBoard([]);
      setPointsBoard([]);
    } finally {
      setLoadingScores(false);
    }
  }, [todayKey]);

  useEffect(() => {
    fetchScoreboard();
  }, [fetchScoreboard]);

  const handleInputChange = (event) => {
    if (gameStatus !== "playing") return;

    const next = event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase();
    if (next.length <= WORD_LENGTH) {
      setCurrentGuess(next);
      persistState({ guesses, status: gameStatus, currentGuess: next, resultSubmitted });
      setErrorMessage("");
    }
  };

  const recordResult = useCallback(
    async (success, attempts, finalGuesses) => {
      if (!user?.id) {
        setResultMessage((prev) =>
          success
            ? `${prev} Sign in to appear on the leaderboard.`
            : `${prev} Sign in to compete on the leaderboard.`
        );
        return;
      }

      if (resultSubmitted) {
        return;
      }

      const points = attemptsToPoints(attempts, success);
      setSubmittingResult(true);

      try {
        const payload = {
          user_id: user.id,
          game_name: GAME_NAME,
          game_date: todayKey,
          attempts: success ? attempts : null,
          success,
          guesses: finalGuesses.map((g) => g.word),
          points,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from("game_scores")
          .upsert(payload, { onConflict: "game_date,game_name,user_id" });

        if (error) {
          throw error;
        }

        setResultSubmitted(true);
        persistState({ guesses: finalGuesses, status: success ? "won" : "lost", currentGuess: "", resultSubmitted: true });
        fetchScoreboard();
      } catch (error) {
        console.error("Error recording result:", error);
        setScoreError("We couldn't record your score just now. Your puzzle progress is still saved locally.");
      } finally {
        setSubmittingResult(false);
      }
    },
    [user?.id, resultSubmitted, todayKey, persistState, fetchScoreboard]
  );

  const handleSubmitGuess = (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (gameStatus !== "playing" || !dailyWord) {
      return;
    }

    if (currentGuess.length !== WORD_LENGTH) {
      setErrorMessage("Please enter a five-letter word.");
      return;
    }

    const guess = currentGuess.toUpperCase();

    const evaluation = evaluateGuess(guess, dailyWord);
    const updatedGuesses = [...guesses, { word: guess, tiles: evaluation }];

    setGuesses(updatedGuesses);
    setCurrentGuess("");

    const isWin = guess === dailyWord;
    const attemptsUsed = updatedGuesses.length;
    const pointsEarned = attemptsToPoints(attemptsUsed, isWin);

    let nextStatus = "playing";
    let nextMessage = "";

    if (isWin) {
      nextStatus = "won";
      nextMessage = `Nice work! You solved today's puzzle in ${attemptsUsed} guess${attemptsUsed === 1 ? "" : "es"} and earned ${pointsEarned} point${pointsEarned === 1 ? "" : "s"}.`;
    } else if (attemptsUsed >= MAX_ATTEMPTS) {
      nextStatus = "lost";
      nextMessage = `The word was ${dailyWord}. Better luck tomorrow!`;
    }

    setGameStatus(nextStatus);
    setResultMessage(nextMessage);

    persistState({ guesses: updatedGuesses, status: nextStatus, currentGuess: "", resultSubmitted });

    if (nextStatus !== "playing") {
      recordResult(isWin, attemptsUsed, updatedGuesses);
    }
  };

  // Handle physical keyboard input
  useEffect(() => {
    if (gameStatus !== "playing" || !dailyWord) return;

    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toUpperCase();
      
      if (key === "ENTER") {
        event.preventDefault();
        if (currentGuess.length === WORD_LENGTH) {
          handleSubmitGuess({ preventDefault: () => {} });
        } else {
          setErrorMessage("Please enter a five-letter word.");
        }
      } else if (key === "BACKSPACE") {
        event.preventDefault();
        if (currentGuess.length > 0) {
          const next = currentGuess.slice(0, -1);
          setCurrentGuess(next);
          persistState({ guesses, status: gameStatus, currentGuess: next, resultSubmitted });
          setErrorMessage("");
        }
      } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
        event.preventDefault();
        const next = currentGuess + key;
        setCurrentGuess(next);
        persistState({ guesses, status: gameStatus, currentGuess: next, resultSubmitted });
        setErrorMessage("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameStatus, dailyWord, currentGuess, guesses, resultSubmitted, persistState, handleSubmitGuess]);

  // Track letter states for keyboard
  const letterStates = useMemo(() => {
    const states = {};
    guesses.forEach((guess) => {
      guess.word.split("").forEach((letter, index) => {
        const status = guess.tiles[index];
        const currentState = states[letter];
        
        // Priority: correct > present > absent
        if (!currentState || 
            (currentState === "absent" && status !== "absent") ||
            (currentState === "present" && status === "correct")) {
          states[letter] = status;
        }
      });
    });
    return states;
  }, [guesses]);

  const handleKeyClick = (letter) => {
    if (gameStatus !== "playing" || !dailyWord) return;
    if (currentGuess.length < WORD_LENGTH) {
      const next = currentGuess + letter.toUpperCase();
      setCurrentGuess(next);
      persistState({ guesses, status: gameStatus, currentGuess: next, resultSubmitted });
      setErrorMessage("");
    }
  };

  const handleBackspace = () => {
    if (gameStatus !== "playing" || !dailyWord) return;
    if (currentGuess.length > 0) {
      const next = currentGuess.slice(0, -1);
      setCurrentGuess(next);
      persistState({ guesses, status: gameStatus, currentGuess: next, resultSubmitted });
      setErrorMessage("");
    }
  };

  const handleEnter = () => {
    if (gameStatus !== "playing" || !dailyWord) return;
    if (currentGuess.length === WORD_LENGTH) {
      handleSubmitGuess({ preventDefault: () => {} });
    } else {
      setErrorMessage("Please enter a five-letter word.");
    }
  };

  const gameBoardRows = useMemo(() => {
    return Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
      const guessEntry = guesses[rowIndex];
      const isCurrentRow = rowIndex === guesses.length;

      return (
        <div key={`row-${rowIndex}`} className="wordle-row">
          {Array.from({ length: WORD_LENGTH }, (_, colIndex) => {
            const letter = guessEntry
              ? guessEntry.word[colIndex]
              : isCurrentRow
                ? currentGuess[colIndex] || ""
                : "";

            const status = guessEntry ? guessEntry.tiles[colIndex] : "";

            return (
              <div key={`tile-${rowIndex}-${colIndex}`} className={`wordle-tile ${status}`.trim()}>
                {letter || ""}
              </div>
            );
          })}
        </div>
      );
    });
  }, [guesses, currentGuess]);

  const renderScoreboardList = (entries, isPointsView = false) => {
    if (loadingScores) {
      return <p className="scoreboard-loading">Loading leaderboard...</p>;
    }
    if (scoreError) {
      return <p className="scoreboard-error">{scoreError}</p>;
    }
    if (entries.length === 0) {
      return (
        <p className="scoreboard-empty">
          {isPointsView ? "No points have been recorded yet. Play daily to climb the rankings." : "No scores recorded today. Be the first on the board!"}
        </p>
      );
    }

    return (
      <ol className="scoreboard-list">
        {entries.map((entry) => {
          const profile = entry.profile;
          const displayName = profile?.nickname || "Player";
          const isCurrentUser = user?.id === entry.user_id;
          const attemptsLabel = entry.success
            ? `${entry.attempts ?? ""} ${entry.attempts === 1 ? "try" : "tries"}`
            : "X";
          const pointsLabel = typeof entry.points === "number" ? `${entry.points} pts` : "";

          const totalPointsLabel = `${entry.totalPoints ?? 0} pts`;

          return (
            <li key={`${entry.user_id}-${isPointsView ? "points" : entry.completed_at || "today"}`} className={`scoreboard-row ${isCurrentUser ? "current" : ""}`.trim()}>
              <div className="scoreboard-player">
                <div className="scoreboard-avatar">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} />
                  ) : (
                    <div className="scoreboard-avatar-placeholder">
                      {displayName[0]?.toUpperCase() || "P"}
                    </div>
                  )}
                </div>
                <span className="scoreboard-name">{displayName}</span>
              </div>
              <div className="scoreboard-attempts">
                {isPointsView ? (
                  <span className="scoreboard-points-label">{totalPointsLabel}</span>
                ) : (
                  <>
                    <span>{attemptsLabel}</span>
                    {pointsLabel && <span className="scoreboard-points-label">{pointsLabel}</span>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  };

  const leaderboardContent = activeLeaderboard === "daily"
    ? renderScoreboardList(dailyBoard)
    : renderScoreboardList(pointsBoard, true);

  return (
    <div className="page-content games-page">
      <h1>Games</h1>
      {dailyWord ? (
        <div className="games-grid">
          <section className="game-card">
            <div className="game-card-header">
              <h2>Daily Word Dash</h2>
              <div className="game-subtitle">
                <span className="game-subtitle-date">{todayDisplay}</span>
              </div>
            </div>
            <div className="wordle-board">{gameBoardRows}</div>
            <div className="wordle-keyboard-container">
              <div className="wordle-keyboard">
                <div className="keyboard-row">
                  {["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      className={`keyboard-key ${letterStates[letter] || ""}`.trim()}
                      onClick={() => handleKeyClick(letter)}
                      disabled={gameStatus !== "playing" || !dailyWord}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
                <div className="keyboard-row">
                  {["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      className={`keyboard-key ${letterStates[letter] || ""}`.trim()}
                      onClick={() => handleKeyClick(letter)}
                      disabled={gameStatus !== "playing" || !dailyWord}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
                <div className="keyboard-row">
                  <button
                    type="button"
                    className="keyboard-key keyboard-key-enter"
                    onClick={handleEnter}
                    disabled={gameStatus !== "playing" || !dailyWord || currentGuess.length !== WORD_LENGTH}
                  >
                    ENTER
                  </button>
                  {["Z", "X", "C", "V", "B", "N", "M"].map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      className={`keyboard-key ${letterStates[letter] || ""}`.trim()}
                      onClick={() => handleKeyClick(letter)}
                      disabled={gameStatus !== "playing" || !dailyWord}
                    >
                      {letter}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="keyboard-key keyboard-key-backspace"
                    onClick={handleBackspace}
                    disabled={gameStatus !== "playing" || !dailyWord || currentGuess.length === 0}
                  >
                    ⌫
                  </button>
                </div>
              </div>
            </div>
            {errorMessage && <p className="wordle-error">{errorMessage}</p>}
            {resultMessage && <p className="wordle-result">{resultMessage}</p>}
            {submittingResult && <p className="wordle-saver">Updating leaderboard...</p>}
          </section>

          <section className="scoreboard-card">
            <div className="game-card-header">
              <h2>Leaderboard</h2>
              <div className="game-subtitle">
                <span className="game-subtitle-label">Word Dash</span>
              </div>
            </div>
            {!user && <p className="scoreboard-note">Sign in to have your results counted on the leaderboard.</p>}
            <div className="leaderboard-toggle">
              <button
                type="button"
                className={activeLeaderboard === "daily" ? "active" : ""}
                onClick={() => setActiveLeaderboard("daily")}
              >
                Daily Results
              </button>
              <button
                type="button"
                className={activeLeaderboard === "points" ? "active" : ""}
                onClick={() => setActiveLeaderboard("points")}
              >
                All-Time Points
              </button>
            </div>
            <p className="points-key">Points by attempt #: 10, 5, 4, 3, 2, 1</p>
            {leaderboardContent}
          </section>
        </div>
      ) : (
        <p className="games-loading">Loading today's puzzle...</p>
      )}

    </div>
  );
}

export default Games;

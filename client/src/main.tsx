import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LecturerLoginPage from "./pages/LecturerLoginPage";
import LecturerRegisterPage from "./pages/LecturerRegisterPage";
import CreateSessionPage from "./pages/CreateSessionPage";
import LecturerSetupPage from "./pages/LecturerSetupPage";
import LecturerLivePage from "./pages/LecturerLivePage";
import JoinPage from "./pages/JoinPage";
import StudentSessionPage from "./pages/StudentSessionPage";
import QuizLibraryPage from "./pages/QuizLibraryPage";
import QuizEditorPage from "./pages/QuizEditorPage";
import RequireLecturerAuth from "./components/RequireLecturerAuth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lecturer/login" element={<LecturerLoginPage />} />
        <Route path="/lecturer/register" element={<LecturerRegisterPage />} />
        <Route path="/create" element={<RequireLecturerAuth><CreateSessionPage /></RequireLecturerAuth>} />
        <Route path="/l/:code" element={<RequireLecturerAuth><LecturerSetupPage /></RequireLecturerAuth>} />
        <Route path="/l/:code/quizzes" element={<RequireLecturerAuth><QuizLibraryPage /></RequireLecturerAuth>} />
        <Route path="/lecturer/quizzes/new" element={<RequireLecturerAuth><QuizEditorPage /></RequireLecturerAuth>} />
        <Route path="/lecturer/quizzes/:id" element={<RequireLecturerAuth><QuizEditorPage /></RequireLecturerAuth>} />
        <Route path="/l/:code/live" element={<RequireLecturerAuth><LecturerLivePage /></RequireLecturerAuth>} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/s/:code" element={<StudentSessionPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

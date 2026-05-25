"use client";

import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import Modal from "./Modal";
import { Profile, requestDeleteOwnAccount } from "@/app/page";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FormEvent, useState } from "react";

type Props = {
  onClose: () => void;
  user: User | null;
  profile: Profile | null;
};

export default function ServerProfileModal({ onClose, user, profile }: Props) {
  const isLoggedIn = !!user;
  const supabase = createClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingDeletion, setLoadingDeletion] = useState(false);

  const handleDelete = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setLoadingDeletion(true);
    
    // await new Promise((resolve) => setTimeout(resolve, 2000));
    if (user && profile) {
      await supabase.rpc("delete_user");
      await supabase.auth.signOut();
      window.location.reload();
    }

    setLoadingDeletion(false);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      {isLoggedIn ? (
        <div>
          <div className="flex flex-row gap-2 justify-between mb-2">
            <h2 className="mt-0">
              <strong>Username:</strong> {profile?.username}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <h2 className="mt-0 mb-2">
            <strong>Email:</strong> {profile?.email}
          </h2>
          <p>
            <strong>Plan:</strong> <span
              className={`py-0.5 px-2 rounded-lg ${profile?.plan == "free" ? "bg-blue-500" : "bg-purple-500"} select-none`}
            >{profile?.plan.substring(0, 1).toUpperCase()}{profile?.plan.substring(1)}</span>
          </p>

          <div className="flex flex-row justify-center gap-4 mb-4">
            <button
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                window.location.reload();
              }}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg border-0 cursor-pointer flex flex-row items-center gap-2"
            >
              <FontAwesomeIcon icon="x" />
              <p>Sign out</p>
            </button>

            <button
              onClick={async () => setIsDeleting(true)}
              className="mt-4 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg border-0 cursor-pointer flex flex-row items-center gap-2"
            >
              <FontAwesomeIcon icon="trash" />
              <p>Delete account</p>
            </button>
          </div>

          {isDeleting && (
            <form onSubmit={handleDelete} className="flex flex-col gap-2">
              <label htmlFor="email">
                Are you sure you want to delete your account? This action is
                irreversible. Type your email in the below box to confirm your
                deletion:
              </label>
              <input
                type="email"
                id="email"
                placeholder="your email"
                required
                pattern={profile?.email}
                className="bg-gray-800 text-gray-300 placeholder:text-gray-500 border border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="mt-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg border-0 cursor-pointer flex flex-row gap-1 items-center justify-center"
              >
                <p>Confirm Deletion </p>
                {loadingDeletion && (
                  <FontAwesomeIcon className="text-white" icon="spinner" spin />
                )}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-row gap-2 justify-between mb-2">
            <h2>Log in</h2>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p>You are not logged in. Please log in to view your profile.</p>

          <button
            onClick={async () => {
              const search = window.location.search;

              const { data, error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo:
                    "https://nondemonstrable-carmine-ungenially.ngrok-free.dev/auth/callback",
                  // window.location.origin + "/auth/callback" + search,
                },
              });
            }}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg border-0 cursor-pointer flex flex-row items-center gap-2"
          >
            <FontAwesomeIcon icon="fab fa-google" />
            <p>Log in using Google</p>
          </button>
        </div>
      )}
    </Modal>
  );
}
